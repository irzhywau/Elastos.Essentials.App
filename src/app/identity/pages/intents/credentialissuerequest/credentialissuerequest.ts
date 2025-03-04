import { Component, NgZone, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { TitleBarNavigationMode } from 'src/app/components/titlebar/titlebar.types';
import { CredIssueIdentityIntent } from 'src/app/identity/model/identity.intents';
import { IntentReceiverService } from 'src/app/identity/services/intentreceiver.service';
import { Logger } from 'src/app/logger';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { DIDURL } from '../../../model/didurl.model';
import { AuthService } from '../../../services/auth.service';
import { DIDService } from '../../../services/did.service';
import { PopupProvider } from '../../../services/popup';
import { UXService } from '../../../services/ux.service';

// TODO: Verify and show clear errors in case data is missing in credentials (expiration date, issuer, etc).
// TODO: Resolve issuer's DID and try to display more user friendly information about the issuer

// Displayable version of a verifiable credential subject entry (a credential can contain several information
// in its subject).
type IssuedCredentialItem = {
  name: string,
  value: any,
  showData: boolean,
}

// Displayable version of a verifiable credential. Can contain one or more IssuedCredentialItem that
// are displayable version of verifiable credential subject entries.
type IssuedCredential = {
  identifier: string,
  receiver: string,
  expirationDate: Date,
  values: IssuedCredentialItem[],
}

/*
Request example:
{
  appPackageId: "org.mycompany.myapp",
  identifier: "customcredentialkey", // unique identifier for this credential
  types: [], // Additional credential types (strings) such as BasicProfileCredential.
  subjectdid: "did:elastos:abc", // DID targeted by the created credential. Only that did will be able to import the credential.
  properties: [{
      someCustomData: "Here is a test data that will appear in someone else's DID document after he imports it."
  }],
  expirationDate: new Date(2024,12,12)
}
*/
@Component({
  selector: 'page-credentialissuerequest',
  templateUrl: 'credentialissuerequest.html',
  styleUrls: ['credentialissuerequest.scss']
})
export class CredentialIssueRequestPage {
  @ViewChild(TitleBarComponent, { static: false }) titleBar: TitleBarComponent;

  public receivedIntent: CredIssueIdentityIntent = null;
  public displayableCredential: IssuedCredential = null; // Displayable reworked material
  public preliminaryChecksCompleted = false;

  private alreadySentIntentResponce = false;

  public showIdentifier = false;
  public showReceiver = true;
  public showExpiration = false;
  public showValues = false;

  constructor(
    private zone: NgZone,
    public didService: DIDService,
    private popup: PopupProvider,
    private uxService: UXService,
    private authService: AuthService,
    private appServices: UXService,
    private translate: TranslateService,
    public theme: GlobalThemeService,
    private intentService: IntentReceiverService
  ) {
  }

  ionViewWillEnter() {
    this.titleBar.setTitle(this.translate.instant('identity.credential-issue'));
    this.titleBar.setNavigationMode(TitleBarNavigationMode.CLOSE);

    this.zone.run(() => {
      this.receivedIntent = this.intentService.getReceivedIntent();
      this.organizeDisplayableInformation();
      this.runPreliminaryChecks();

      Logger.log('Identity', "Displayable credential:", this.displayableCredential)
    });
  }

  ionViewWillLeave() {
    if (!this.alreadySentIntentResponce) {
        void this.rejectRequest(false);
    }
  }

  /**
   * Check a few things after entering the screen. Mostly, issued credential content quality.
   */
  runPreliminaryChecks() {
    // Nothing yet

    this.preliminaryChecksCompleted = true; // Checks completed and everything is all right.
  }

  /**
   * From the raw data provided by the caller, we create our internal model ready for UI.
   */
  organizeDisplayableInformation() {
    // Generate a displayable version of each entry found in the credential subject
    let displayableEntries: IssuedCredentialItem[] = [];
    for (let propertyEntryKey of Object.keys(this.receivedIntent.params.properties)) {
      let propertyEntryValue = this.receivedIntent.params.properties[propertyEntryKey];

      let displayableEntry: IssuedCredentialItem = {
        name: propertyEntryKey,
        value: propertyEntryValue,
        showData: true
      }

      displayableEntries.push(displayableEntry);
    }

    this.displayableCredential = {
      // The received identitier should NOT start with #, but DID SDK credentials start with #.
      identifier: new DIDURL("#" + this.receivedIntent.params.identifier).getFragment(),
      receiver: this.receivedIntent.params.subjectdid,
      expirationDate: null,
      values: displayableEntries,
    };

    if (this.receivedIntent.params.expirationDate) // Should be a ISO date string
      this.displayableCredential.expirationDate = new Date(this.receivedIntent.params.expirationDate);
    else {
      let now = new Date().getTime();
      let fiveDaysAsMs = 5 * 24 * 60 * 60 * 1000;
      this.displayableCredential.expirationDate = new Date(now + fiveDaysAsMs);
    }
  }

  getDisplayableEntryValue(value: any) {
    if (value instanceof Object) {
      return JSON.stringify(value, null, "&nbsp;").replace(/(?:\r\n|\r|\n)/g, '<br/>');
    }

    return value;
  }

  acceptRequest() {
    // Save the credentials to user's DID.
    // NOTE: For now we save all credentials, we can't select them individually.
    // eslint-disable-next-line require-await
    void AuthService.instance.checkPasswordThenExecute(async () => {
      Logger.log('Identity', "CredIssueRequest - issuing credential");

      let validityDays = (this.displayableCredential.expirationDate.getTime() - Date.now()) / 1000 / 60 / 60 / 24;

      this.didService.getActiveDid().pluginDid.issueCredential(
        this.displayableCredential.receiver,
        "#" + this.displayableCredential.identifier,
        this.receivedIntent.params.types,
        validityDays,
        this.receivedIntent.params.properties,
        this.authService.getCurrentUserPassword(),
        (issuedCredential) => {
          void this.popup.ionicAlert(this.translate.instant('identity.credential-issued'), this.translate.instant('identity.credential-issued-success'), this.translate.instant('common.done')).then(async () => {
            Logger.log('Identity', "Sending credissue intent response for intent id " + this.receivedIntent.intentId)
            let credentialAsString = await issuedCredential.toString();
            await this.sendIntentResponse({
              credential: credentialAsString
            }, this.receivedIntent.intentId);
          })
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
        }, async (err) => {
          await this.popup.ionicAlert(this.translate.instant('common.error'), this.translate.instant('identity.credential-issued-error') + JSON.stringify(err), this.translate.instant('common.close'));
          void this.rejectRequest();
        });
    }, () => {
      // Cancelled
    });
  }

  async rejectRequest(navigateBack = true) {
    await this.sendIntentResponse({}, this.receivedIntent.intentId, navigateBack);
  }

  private async sendIntentResponse(result, intentId, navigateBack = true) {
    this.alreadySentIntentResponce = true;
    await this.appServices.sendIntentResponse(result, intentId, navigateBack);
  }
}
