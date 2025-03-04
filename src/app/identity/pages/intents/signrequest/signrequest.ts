import { Component, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { TitleBarNavigationMode } from 'src/app/components/titlebar/titlebar.types';
import { SignIdentityIntent } from 'src/app/identity/model/identity.intents';
import { IntentReceiverService } from 'src/app/identity/services/intentreceiver.service';
import { Logger } from 'src/app/logger';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { AuthService } from '../../../services/auth.service';
import { DIDService } from '../../../services/did.service';
import { PopupProvider } from '../../../services/popup';
import { UXService } from '../../../services/ux.service';

/*
Request example:
{
  appPackageId: "org.mycompany.myapp",
  intentId: -1,
  allParams: {
    data: "please-sign-this"
  }
}
*/
@Component({
  selector: 'page-signrequest',
  templateUrl: 'signrequest.html',
  styleUrls: ['signrequest.scss']
})
export class SignRequestPage {
  @ViewChild(TitleBarComponent, { static: false }) titleBar: TitleBarComponent;

  public receivedIntent: SignIdentityIntent = null;
  private alreadySentIntentResponce = false;

  constructor(
    private didService: DIDService,
    private popup: PopupProvider,
    private translate: TranslateService,
    private appServices: UXService,
    private authService: AuthService,
    public theme: GlobalThemeService,
    private intentService: IntentReceiverService
  ) {
  }

  ionViewWillEnter() {
    this.titleBar.setTitle(this.translate.instant('identity.sign-data'));
    this.titleBar.setNavigationMode(TitleBarNavigationMode.CLOSE);

    this.receivedIntent = this.intentService.getReceivedIntent();
  }

  ionViewWillLeave() {
    if (!this.alreadySentIntentResponce) {
        void this.rejectRequest(false);
    }
  }

  acceptRequest() {
    Logger.log('Identity', "Signing user data now");

    // Prompt password if needed
    void AuthService.instance.checkPasswordThenExecute(async () => {
      let password = AuthService.instance.getCurrentUserPassword();

      let intentRequestData = this.receivedIntent.params;

      let signature = await this.didService.getActiveDid().signData(this.receivedIntent.params.data, password);
      let publicKey = await this.didService.getActiveDid().getLocalDIDDocument().getDefaultPublicKey();

      let payload = {};

      // First, fill the payload with all JWT extra passed by the calling app, if any
      if (intentRequestData.jwtExtra)
        Object.assign(payload, intentRequestData.jwtExtra);

      // Then, store the signed data using either the app signatureFieldName, or as default "signature" field.
      if (intentRequestData.signatureFieldName)
        payload[intentRequestData.signatureFieldName] = signature;
      else
        payload["signature"] = signature; // Default field name

      // Add the public key, for convenience.
      payload["publickey"] = publicKey;

      // Return the original JWT token in case this intent was called by an external url (elastos scheme definition)
      // TODO: Currently adding elastos://sign/ in front of the JWT because of CR website requirement. But we should cleanup this and pass only the JWT itself
      if (this.receivedIntent.originalJwtRequest) {
        payload["req"] = "elastos://didsign/" + this.receivedIntent.originalJwtRequest;
      }

      // Return the signature info as a signed JWT in case runtime needs to send this response through a URL
      // callback. If that's inside Elastos Essentials, the JWT will be parsed and the calling app will receive the
      // signature payload.
      let jwtToken = await this.didService.getActiveDid().getLocalDIDDocument().createJWT(payload,
        1, this.authService.getCurrentUserPassword());

      // Send the intent response as everything is completed
      Logger.log('Identity', "Data signed, sending intent response");
      try {
        await this.sendIntentResponse({ jwt: jwtToken }, this.receivedIntent.intentId);
      }
      catch (e) {
        await this.popup.ionicAlert("Response error", "Sorry, we were unable to return the signed information to the calling app. " + e);
      }
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
