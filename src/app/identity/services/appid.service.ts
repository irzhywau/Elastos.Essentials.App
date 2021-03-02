import { Injectable } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { AuthService } from "./auth.service";
import { DIDService } from "./did.service";
import { UXService } from "./ux.service";

/**
 * Service responsible for generating "application identity credentials". Those credentials
 * are for now mostly used by the hive authenticaiton layer in order to delete some power
 * to a calling app, prooving that it is who it pretends to be, therefore being able to do further
 * operations without always requiring the user to sign with his DID, as this would require opening
 * this DID app often.
 */
@Injectable({
  providedIn: "root",
})
export class AppIDService {
  private intentId: string = null;
  private appPackageId: string = null;
  private appInstanceDID: string = null;
  private externallyProvidedAppDID: string = null;

  constructor(
    private authService: AuthService,
    private uxService: UXService,
    private didService: DIDService) {
  }

  public prepareNextRequest(intentId: string, appPackageId: string, appInstanceDID: string, externallyProvidedAppDID: string) {
    this.intentId = intentId;
    this.appPackageId = appPackageId;
    this.appInstanceDID = appInstanceDID;
    this.externallyProvidedAppDID = externallyProvidedAppDID;
  }

  public async applicationIDCredentialCanBeIssuedWithoutUI(intentParams: any): Promise<boolean> {
    if (!await this.uxService.isIntentResponseGoingOutsideElastos(intentParams)) {
      // Get real app did from runtime
      let appDid = await this.uxService.getAppDid(this.appPackageId);
      if (!appDid) {
        console.log("Can't issue app id credential silently: no appDID for package id "+this.appPackageId);
        return false;
      }
      else {
        console.log("App id credential can be issued silently");
        return true;
      }
    }
    else {
      // From native apps, force showing a screen
      console.log("Can't issue app id credential silently: called from a native app");
      return false;
    }
  }

  private async getActualAppDID(intentParams: any): Promise<string> {
    if (!await this.uxService.isIntentResponseGoingOutsideElastos(intentParams)) {
      let appDid = await this.uxService.getAppDid(this.appPackageId);
      // Theoretically, we have checked the app DID before, so it must always be defined here.
      return appDid;
    }
    else {
      // We don't need to blindly trust if this DID is genuine or not. The trinity runtime wille
      // match it with the redirect url that is registered in app did document on chain, when
      // sending the intent response.
      return this.externallyProvidedAppDID;
    }
  }

  public async generateAndSendApplicationIDCredentialIntentResponse(intentParams: any) {
    let properties = {
      appInstanceDid: this.appInstanceDID,
      appDid: await this.getActualAppDID(intentParams),
    };

    AuthService.instance.checkPasswordThenExecute(async () => {
      console.log("AppIdCredIssueRequest - issuing credential");

      this.didService.getActiveDid().pluginDid.issueCredential(
        this.appInstanceDID,
        "#app-id-credential",
        ['AppIdCredential'],
        30, // one month - after that, we'll need to generate this credential again.
        properties,
        this.authService.getCurrentUserPassword(),
        async (issuedCredential) => {
          console.log("Sending appidcredissue intent response for intent id " + this.intentId)
          let credentialAsString = await issuedCredential.toString();
          await this.uxService.sendIntentResponse("appidcredissue", {
            credential: credentialAsString
          }, this.intentId);
        }, async (err) => {
          console.error("Failed to issue the app id credential...", err);
          this.rejectExternalRequest();
        });
    }, () => {
      // Cancelled
      this.rejectExternalRequest();
    });
  }

  public async rejectExternalRequest() {
    await this.uxService.sendIntentResponse("appidcredissue", {}, this.intentId);
  }
}
