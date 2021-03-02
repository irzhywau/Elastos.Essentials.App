import { Component, NgZone, ViewChild } from '@angular/core';

import { Config } from '../../services/config';
import { DIDService } from '../../services/did.service';
import { UXService } from '../../services/ux.service';
import { TranslateService } from '@ngx-translate/core';
import { DIDURL } from '../../model/didurl.model';
import { AuthService } from '../../services/auth.service';
import { DIDDocumentPublishEvent } from '../../model/eventtypes.model';
import { ProfileService } from '../../services/profile.service';
import { DIDSyncService } from '../../services/didsync.service';
import { Events } from '../../services/events.service';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { TitleBarNavigationMode } from 'src/app/components/titlebar/titlebar.types';

// TODO: Show credential(s) content that will be created to the user. He needs to make sure for example
// that no shared credential will overwrite existing ones like "name" or "email"...

type RegAppProfileIntentParamLocalizedString = {
  lang: string,
  value: string
}
type RegAppProfileIntentParamActionTitle = string | RegAppProfileIntentParamLocalizedString[];

type RegAppProfileIntentParamFlatClaim = {}; // "key": "value"

type RegAppProfileIntentParams = {
    identifier: string,
    connectactiontitle: RegAppProfileIntentParamActionTitle
    customcredentialtypes: string[],
    sharedclaims: RegAppProfileIntentParamFlatClaim[];
}

/*
Request example:
{
  appPackageId: "org.mycompany.myapp",
  intentId: -1,
  allParams: {
    identifier: "",
    connectactiontitle: "", // Or [{lang:"", value:""},...]
    customcredentialtypes: [],
    sharedclaims:[
      {name: "Updated Ben"}
    ]
  }
}
*/
@Component({
  selector: 'page-regappprofilerequest',
  templateUrl: 'regappprofilerequest.html',
  styleUrls: ['regappprofilerequest.scss']
})
export class RegisterApplicationProfileRequestPage {
  @ViewChild(TitleBarComponent, { static: false }) titleBar: TitleBarComponent;

  requestDapp: {
    intentId: number,
    appPackageId: string,
    allParams: RegAppProfileIntentParams
  } = null;

  credentials: DIDPlugin.VerifiableCredential[] = [];
  denyReason = '';

  public shouldPublishOnSidechain: boolean = true;

  constructor(
    private zone: NgZone,
    private didService: DIDService,
    private events: Events,
    private uxService:UXService,
    private translate: TranslateService,
    private appServices: UXService,
    public profileService: ProfileService,
    private didSyncService: DIDSyncService,
    public theme: GlobalThemeService
  ) {
  }

  ionViewWillEnter() {
    this.titleBar.setTitle(this.translate.instant('app-profile'));
    this.titleBar.setNavigationMode(TitleBarNavigationMode.CLOSE);
    this.uxService.makeAppVisible();

    console.log("Received request data:", Config.requestDapp);
    this.requestDapp = Config.requestDapp;

    // Fix missing or wrong values, just in case
    if (!this.requestDapp.allParams.customcredentialtypes)
      this.requestDapp.allParams.customcredentialtypes = [];

    if (!this.requestDapp.allParams.sharedclaims)
      this.requestDapp.allParams.sharedclaims = [];

    console.log("Modified request data:", this.requestDapp);
  }

  ionViewDidEnter() {
    // Listen to publication result event to know when the wallet app returns from the "didtransaction" intent
    // request initiated by publish() on a did document.
    this.events.subscribe("diddocument:publishresultpopupclosed", async (result: DIDDocumentPublishEvent)=>{
      console.log("diddocument:publishresultpopupclosed event received in regappprofile request", result);
      if (result.published) {
        await this.sendIntentResponse();
      }
    });
  }

  async acceptRequest() {
    // Prompt password if needed
    AuthService.instance.checkPasswordThenExecute(async ()=>{
      let password = AuthService.instance.getCurrentUserPassword();

      // Create the main application profile credential
      await this.createMainApplicationProfileCredential(password);

      // Create individual credentials for each shared claim
      await this.createIndependantCredentials(password);

      // Publish new credential if permitted
      if(this.shouldPublishOnSidechain) {
        await this.didSyncService.publishActiveDIDDIDDocument(password);
      } else {
        await this.sendIntentResponse();
      }
    }, ()=>{
      // Cancelled
    });
  }

  async sendIntentResponse() {
    // Send the intent response as everything is completed
    await this.appServices.sendIntentResponse("registerapplicationprofile", {}, this.requestDapp.intentId);
  }

  async createMainApplicationProfileCredential(password: string) {
    console.log("Creating application profile credential");

    // The credential title is the identifier given by the application. Ex: "twitter".
    let credentialTitle = this.requestDapp.allParams.identifier;

    // Add the standard "ApplicationProfileCredential" credential type, plus any other type provided by the requester.
    let customCredentialTypes = [
      "ApplicationProfileCredential"
    ];
    this.requestDapp.allParams.customcredentialtypes.map((type)=>customCredentialTypes.push(type));

    // Map each parameter provided by the app as a custom parameter for the main credential
    let props = {};
    Object.keys(this.requestDapp.allParams).map((key)=>{
      // Skip non-user keys
      if (key == "identifier" || key == "sharedclaims" || key == "customcredentialtypes" || key == "connectactiontitle")
        return;

      let value = this.requestDapp.allParams[key];
      console.log("Including field in app profile credential: key:",key," value:",value);
      props[key] = value;
    });

    // Append mandatory credential properties
    props["identifier"] = this.requestDapp.allParams.identifier;
    props["action"] = this.requestDapp.allParams.connectactiontitle;
    props["apppackage"] = this.requestDapp.appPackageId;
    props["apptype"] = "elastosbrowser";

    console.log("Credential properties:", props);

    // Create and append the new ApplicationProfileCredential credential to the local store.
    let credentialId = new DIDURL("#"+credentialTitle);
    let createdCredential = await this.didService.getActiveDid().addCredential(credentialId, props, password, customCredentialTypes);

    // Add this credential to the DID document.
    await this.didService.getActiveDid().getDIDDocument().updateOrAddCredential(createdCredential, password);

    console.warn("diddoc after main app profile added:", this.didService.getActiveDid().getDIDDocument());
  }

  async createIndependantCredentials(password: string) {
    console.log("Creating independant credentials");

    let sharedClaims = this.requestDapp.allParams.sharedclaims;
    for (let sharedClaim of sharedClaims) {
      Object.keys(sharedClaim).map(async (key) => {
        let value = sharedClaim[key];

        console.log("Creating independant credential with key "+key+" and value:", value);
        let credentialId = new DIDURL("#"+key);
        let createdCredential: DIDPlugin.VerifiableCredential = await this.didService.getActiveDid().addCredential(credentialId, {key:value}, password);
        this.credentials.push(createdCredential);
        // Add this credential to the DID document.
        await this.didService.getActiveDid().getDIDDocument().updateOrAddCredential(createdCredential, password);
        console.warn("diddoc after shared claim added:", this.didService.getActiveDid().getDIDDocument());
      });
    }
  }

  async rejectRequest() {
    await this.appServices.sendIntentResponse("registerapplicationprofile", {status: 'cancelled'}, this.requestDapp.intentId);
  }
}
