import { Component, OnInit, ViewChild } from '@angular/core';
import { NavController, AlertController, PopoverController } from '@ionic/angular';
import { NgZone} from '@angular/core';
import { HiveService, PaidIncompleteOrder, VaultLinkStatus } from '../../services/hive.service';
import { ActivatedRoute } from '@angular/router';
import { AppService } from '../../services/app.service';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { PopupService } from '../../services/popup.service';
import { PrefsService } from '../../services/prefs.service';
import { TranslateService } from '@ngx-translate/core';
import { Events } from '../../services/events.service';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { TitleBarMenuItem, BuiltInIcon, TitleBarNavigationMode } from 'src/app/components/titlebar/titlebar.types';
import { Logger } from 'src/app/logger';
import { NetworkType } from 'src/app/model/networktype';
import { TitlebarmenuitemComponent } from 'src/app/components/titlebarmenuitem/titlebarmenuitem.component';

type StorageProvider = {
  name: string,
  vaultAddress: string
}

@Component({
  selector: 'app-pickprovider',
  templateUrl: './pickprovider.page.html',
  styleUrls: ['./pickprovider.page.scss'],
})
export class PickProviderPage implements OnInit {
  @ViewChild(TitleBarComponent, { static: false }) titleBar: TitleBarComponent;

  public checkingInitialStatus: boolean = false;
  public vaultProviderCouldBeContacted: boolean = false;
  private vaultLinkStatus: VaultLinkStatus = null;
  private forceProviderChange = false;
  private developerMode = false;
  public manualProviderAddress: string = null;
  public fetchingActivePaymentPlan = true;
  public activePaymentPlan: HivePlugin.Payment.ActivePricingPlan = null;
  public fetchingOrdersAwaitingTxConfirmation = true;
  public ordersAwaitingTxConfirmation: HivePlugin.Payment.Order[] = [];
  public incompleteOrders: PaidIncompleteOrder[] = []; // Orders paid but not notified to the hive node (payOrder() failed).
  public publishingProvider = false;

  // Hardcoded list of suggested providers for now
  public storageProviders: StorageProvider[] = [];

  private menu: any;

  constructor(
    public navCtrl: NavController,
    public zone: NgZone,
    public alertController:AlertController,
    private translate: TranslateService,
    public hiveService: HiveService,
    private route: ActivatedRoute,
    public theme: GlobalThemeService,
    private popup: PopupService,
    private prefs: PrefsService,
    private events: Events,
    private popoverCtrl: PopoverController
  ) {}

  async ngOnInit() {
    // Adapt the proposed default hive nodes to the selected network in settings.
    let networkType = await this.prefs.getActiveNetworkType();
    if (networkType == NetworkType.MainNet) {
      this.storageProviders =  [
        { name: 'Trinity Tech Hive 1', vaultAddress: "https://hive1.trinity-tech.io" },
        { name: 'Trinity Tech Hive 2', vaultAddress: "https://hive2.trinity-tech.io" }
      ];
    }
    else if (networkType == NetworkType.TestNet) {
      this.storageProviders =  [
        { name: 'Trinity Tech Hive Testnet 1', vaultAddress: "https://hive-testnet1.trinity-tech.io" },
        { name: 'Trinity Tech Hive Testnet 2', vaultAddress: "https://hive-testnet2.trinity-tech.io" }
      ];
    }
    else {
      this.storageProviders = [];
    }

    this.route.queryParams.subscribe((data) => {
      //Logger.log("HiveManager", "QUERY PARAMS", data);
    });

    this.events.subscribe("plan-just-purchased", ()=>{
      Logger.log("HiveManager", "Payment just purchased. Refreshing status.");
      this.checkInitialStatus();
    });
  }

  async ionViewWillEnter() {
    let menuItems: TitleBarMenuItem[] = [
      {
        title: this.translate.instant('hive-menu.vault-providers-administration'),
        key: "pickprovider-adminproviders",
        iconPath: BuiltInIcon.SETTINGS
      }
    ];

    this.developerMode = await this.prefs.developerModeEnabled();

    if (this.developerMode) {
      // Add a special menu item to be able to switch to another vault without transfer
      menuItems.push({
        title: this.translate.instant('hive-menu.force-provider-change'),
        key: "pickprovider-forceproviderchange",
        iconPath: BuiltInIcon.EDIT
      });
    }

    this.titleBar.setMenuVisibility(true);
    this.titleBar.setupMenuItems(menuItems);

    this.titleBar.addOnItemClickedListener(async (clickedIcon) => {
      switch (clickedIcon.key) {
   /*      case "menu":
          await this.openMenu();
          break; */
        case "pickprovider-adminproviders":
          this.goToAdminPanel();
          break;
        case "pickprovider-forceproviderchange":
          Logger.log("HiveManager", "Forcing provider change");
          this.zone.run(() => {
            this.forceProviderChange = true;
            this.vaultProviderCouldBeContacted = true;
          });
          break;
      }
    });

    this.titleBar.setNavigationMode(TitleBarNavigationMode.BACK);

    this.titleBar.setTitle(this.translate.instant('pickprovider.title'));
  }


  ionViewDidEnter(){
    this.checkInitialStatus();
  }

  ionViewWillLeave() {
    this.titleBar.setMenuVisibility(false);

    if (this.popup.alert) {
      this.popup.alertCtrl.dismiss();
      this.popup.alert = null;
    }
  }

/*   async openMenu() {
    this.menu = await this.popoverCtrl.create({
      mode: 'ios',
      component: TitlebarmenuitemComponent,
      componentProps: {
        items: this.titleBar.menuItems
      },
      cssClass: !this.theme.darkMode ? 'titlebarmenu-component' : 'titlebarmenu-component',
      translucent: false
    });
    this.menu.onWillDismiss().then(() => {
      this.menu = null;
    });
    return await this.menu.present();
  }
 */
  private async checkInitialStatus() {
    if (this.checkingInitialStatus)
      return;

    // Reset all states
    this.vaultProviderCouldBeContacted = false;
    this.vaultLinkStatus = null;
    this.fetchingActivePaymentPlan = true;
    this.activePaymentPlan = null;
    this.fetchingOrdersAwaitingTxConfirmation = true;
    this.ordersAwaitingTxConfirmation = [];
    this.incompleteOrders = [];

    this.checkingInitialStatus = true;

    try {
      this.vaultLinkStatus = await this.hiveService.retrieveVaultLinkStatus();
      this.vaultProviderCouldBeContacted = true;

      // Start those checks in background, not blocking.
      Promise.race([
        this.hiveService.tryToFinalizePreviousOrders(),
        this.fetchActivePaymentPlan(),
        this.fetchOrdersAwaitingTxConfirmation(),
      ]);
    }
    catch (e) {
      Logger.warn("HiveManager", "Error while trying to retrieve vault link status: ", e);
      this.vaultProviderCouldBeContacted = false;
    }

    // Mark initial status check phase as completed
    this.checkingInitialStatus = false;
  }

  hasVaultProvider(): boolean {
    if (!this.vaultProviderCouldBeContacted || this.forceProviderChange)
      return false;

    return this.vaultLinkStatus != null && this.vaultLinkStatus.publishedInfo != null;
  }

  publishInProgress(): boolean {
    return this.vaultLinkStatus != null && this.vaultLinkStatus.publishingInfo != null;
  }

  async pickProvider(provider: StorageProvider) {
    await this.publishProvider(provider.name, provider.vaultAddress);
  }

  async manuallySetProvider() {
    if (!this.manualProviderAddress || this.manualProviderAddress == "")
      return;

    await this.publishProvider("Custom vault provider", this.manualProviderAddress.toLowerCase());
  }

  private async publishProvider(providerName: string, providerAddress: string) {
    Logger.log("HiveManager", "Publishing vault provider", providerName, providerAddress);
    this.publishingProvider = true;

    let publicationStarted = await this.hiveService.publishVaultProvider(providerName, providerAddress);

    this.publishingProvider = false;

    // Refresh the link status
    this.vaultLinkStatus = await this.hiveService.retrieveVaultLinkStatus();
    Logger.log("HiveManager", "Vault link status:", this.vaultLinkStatus)

    this.forceProviderChange = false;

    if (publicationStarted) {
      this.vaultLinkStatus.publishingInfo = {
        vaultName: providerName,
        vaultAddress: providerAddress
      }
    }
    else {
      // Cancelled by user - do nothing.
    }
  }

  private async fetchActivePaymentPlan() {
    if (await this.hiveService.getActiveVault()) {
      Logger.log("HiveManager", "Fetching active payment plan");

      // TODO: PERF improvement - getActivePricingPlan() is already called in retrieveVaultLinkStatus(), this is duplicate API call to remove.
      this.activePaymentPlan = await this.hiveService.getActiveVault().getPayment().getActivePricingPlan()
      Logger.log("HiveManager", "Got active payment plan:", this.activePaymentPlan);
    }

    this.fetchingActivePaymentPlan = false;
  }

  /**
   * Retrieves the list of orders paid by the user, for which the transactions have not been
   * confirmed by the vault provider yet.
   */
  private async fetchOrdersAwaitingTxConfirmation() {
    Logger.log("HiveManager", "Starting to fetch orders awaiting confirmation");

    if (await this.hiveService.getActiveVault()) {
      Logger.log("HiveManager", "Getting orders awaiting payment validation");
      this.ordersAwaitingTxConfirmation = await this.hiveService.getOrdersAwaitingPaymentValidation();
    }

    // Also fetch incomplete orders
    Logger.log("HiveManager", "Getting paid incomplete orders");
    this.incompleteOrders = await this.hiveService.getPaidIncompleteOrders();

    Logger.log("HiveManager", "Fetched orders awaiting tx confirmation");

    this.fetchingOrdersAwaitingTxConfirmation = false;
  }

  private goToAdminPanel() {
    this.navCtrl.navigateForward("adminproviderslist");
  }

  public changePlan() {
    this.navCtrl.navigateForward("pickplan");
  }

  public transferVault() {
    this.popup.ionicAlert("alert.not-available", "alert.not-available-msg");
  }
}
