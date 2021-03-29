import { Injectable, NgZone } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { PopupProvider } from './popup.service';
import { UiService } from './ui.service';
import { Events } from './events.service';
import { CoinService } from './coin.service';
import { ContactsService } from './contacts.service';
import { CurrencyService } from './currency.service';
import { IntentService } from './intent.service';
import { NavService } from './nav.service';
import { WalletManager } from './wallet.service';
import { LocalStorage } from './storage.service';
import { Logger } from 'src/app/logger';
import { GlobalDIDSessionsService } from 'src/app/services/global.didsessions.service';
import { WalletPrefsService } from './pref.service';

@Injectable({
  providedIn: 'root'
})
export class WalletInitService {
  private walletServiceInitialized = false;
  private waitforServiceInitialized = false;

  constructor(
    private intentService: IntentService,
    public localStorage: LocalStorage,
    public walletManager: WalletManager,
    public events: Events,
    public zone: NgZone,
    public translate: TranslateService,
    private navService: NavService,
    private currencyService: CurrencyService,
    public popupProvider: PopupProvider,
    public modalCtrl: ModalController,
    private coinService: CoinService,
    private contactsService: ContactsService,
    private prefs: WalletPrefsService,
    private uiService: UiService,
    private didSessions: GlobalDIDSessionsService
  ) {}

  public async init(): Promise<void> {
    this.didSessions.signedInIdentityListener.subscribe(async (signedInIdentity)=>{
      if (signedInIdentity) {
        Logger.log("Wallet", "Wallet service is initializing");

        await this.prefs.init();
        await this.coinService.init();
        await this.currencyService.init();
        await this.contactsService.init();
        await this.uiService.init();

        // Wait until the wallet manager is ready before showing the first screen.
        // TODO: rework
        this.events.subscribe("walletmanager:initialized", () => {
            Logger.log("wallet", "walletmanager:initialized event received");
            this.walletServiceInitialized = true;
        });

        await this.walletManager.init();
        await this.intentService.init();
      } else {
        await this.stop();
      }
    });
  }

  public async stop(): Promise<void> {
    await this.intentService.stop();
    await this.walletManager.stopSyncAllWallet();
  }

  public start() {
    if (this.walletServiceInitialized) {
      this.navService.showStartupScreen();
    } else {
      if (!this.waitforServiceInitialized) {
        this.waitforServiceInitialized = true;
        // Wait until the wallet manager is ready before showing the first screen.
        this.events.subscribe("walletmanager:initialized", () => {
          Logger.log("wallet", "walletmanager:initialized event received, showStartupScreen");
          this.navService.showStartupScreen();
          this.waitforServiceInitialized = false;
        });
      } else {
        Logger.log("wallet", "Wallet service is initializing, The Wallet will be displayed when the service is initialized.");
      }
    }
  }
}
