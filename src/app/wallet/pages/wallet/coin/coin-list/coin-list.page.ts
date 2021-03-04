import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Config } from '../../../../config/Config';
import { LocalStorage } from '../../../../services/storage.service';
import { Native } from '../../../../services/native.service';
import { PopupProvider} from '../../../../services/popup.service';
import { WalletManager } from '../../../../services/wallet.service';
import { MasterWallet } from '../../../../model/wallets/MasterWallet';
import { Coin, CoinType } from '../../../../model/Coin';
import { CoinService } from '../../../../services/coin.service';
import { WalletEditionService } from '../../../../services/walletedition.service';
import { AppService } from '../../../../services/app.service';
import { Util } from '../../../../model/Util';
import { TranslateService } from '@ngx-translate/core';
import { UiService } from '../../../../services/ui.service';
import { CurrencyService } from '../../../../services/currency.service';
import { Events } from '../../../../services/events.service';
import { Subscription } from 'rxjs';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { BuiltInIcon, TitleBarIcon, TitleBarIconSlot } from 'src/app/components/titlebar/titlebar.types';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';

type EditableCoinInfo = {
    coin: Coin,
    isOpen: boolean
};

@Component({
    selector: 'app-coin-list',
    templateUrl: './coin-list.page.html',
    styleUrls: ['./coin-list.page.scss'],
})

export class CoinListPage implements OnInit, OnDestroy {
    @ViewChild(TitleBarComponent, { static: true }) titleBar: TitleBarComponent;
    
    masterWallet: MasterWallet = null;
    coinList: EditableCoinInfo[] = null;
    coinListCache = {};
    payPassword: string = "";
    singleAddress: boolean = false;
    currentCoin: any;

    // Helpers
    public Util = Util;
    public SELA = Config.SELA;
    public CoinType = CoinType;

    private updateSubscription: Subscription = null;
    private destroySubscription: Subscription = null;
    private coinAddSubscription: Subscription = null;
    private coinDeleteSubscription: Subscription = null;

    // Titlebar
    private onItemClickedListener: any;

    constructor(
        public walletManager: WalletManager,
        public popupProvider: PopupProvider,
        private coinService: CoinService,
        private walletEditionService: WalletEditionService,
        private appService: AppService,
        public native: Native,
        public localStorage: LocalStorage,
        public modalCtrl: ModalController,
        public events: Events,
        private translate: TranslateService,
        public theme: GlobalThemeService,
        public currencyService: CurrencyService,
        public uiService: UiService
    ) {
    }

    ngOnInit() {
        this.titleBar.addOnItemClickedListener(this.onItemClickedListener = (menuIcon: TitleBarIcon) => {
            if (menuIcon.key == "add-erc20-coin")
                this.handleOnAddECR20Coin();
        });
    }

    unsubscribe(subscription: Subscription) {
      if (subscription) {
        subscription.unsubscribe();
        subscription = null;
      }
    }

    ngOnDestroy() {
        this.unsubscribe(this.updateSubscription);
        this.unsubscribe(this.destroySubscription);
        this.unsubscribe(this.coinAddSubscription);
        this.unsubscribe(this.coinDeleteSubscription);

        this.titleBar.removeOnItemClickedListener(this.onItemClickedListener);
        this.onItemClickedListener = null;
    }

    ionViewWillEnter() {
        this.appService.setTitleBarTitle(this.translate.instant("coin-list-title"));

        this.titleBar.setIcon(TitleBarIconSlot.OUTER_RIGHT, {
            key: "add-erc20-coin",
            iconPath: BuiltInIcon.ADD
        });

        this.init();
    }

    ionViewWillLeave() {
        this.titleBar.setIcon(TitleBarIconSlot.OUTER_RIGHT, null);

        if (this.popupProvider.alertPopup) {
            this.popupProvider.alertCtrl.dismiss();
            this.popupProvider.alertPopup = null;
        }
    }

    async switchCoin(item: EditableCoinInfo, open: boolean) {
        item.isOpen = open;
        this.native.info(item);

        this.currentCoin = item;
        await this.native.showLoading();

        if (item.isOpen) {
            await this.createSubWallet(item.coin);
        } else {
            await this.destroySubWallet(item.coin);
        }
    }

    async init() {
        this.updateSubscription = this.events.subscribe("error:update", () => {
            this.currentCoin["open"] = false;
        });
        this.destroySubscription = this.events.subscribe("error:destroySubWallet", () => {
            this.currentCoin["open"] = true;
        });
        this.coinAddSubscription = this.events.subscribe("custom-coin-added", () => {
            this.refreshCoinList();
        });
        this.coinDeleteSubscription = this.events.subscribe("custom-coin-deleted", () => {
            this.refreshCoinList();
        });

        this.masterWallet = this.walletManager.getMasterWallet(this.walletEditionService.modifiedMasterWalletId);

        this.native.hideLoading();

        await this.refreshCoinList();
    }

    private async refreshCoinList() {
        this.coinList = [];
        for (let availableCoin of await this.coinService.getAvailableCoins()) {
            let isOpen = (availableCoin.getID() in this.masterWallet.subWallets);
            console.log(availableCoin, "isOpen?", isOpen);
            this.coinList.push({ coin: availableCoin, isOpen: isOpen });
        }
        console.log('coin list', this.coinList);
    }

    async createSubWallet(coin: Coin) {
        try {
            this.native.hideLoading();

            // Create the sub Wallet (ex: IDChain)
            await this.masterWallet.createSubWallet(coin);
        } catch (error) {
            this.currentCoin["open"] = false; // TODO: currentCoin type
        }
    }

    async destroySubWallet(coin: Coin) {
        this.native.hideLoading();

        await this.masterWallet.destroySubWallet(coin.getID());
    }

    onSelect(item: EditableCoinInfo) {
        console.log('Toggle triggered!', item);
        if (item.isOpen) {
            this.switchCoin(item, true);
        } else {
            this.popupProvider.ionicConfirm('confirmTitle', 'text-coin-close-warning').then((data) => {
                if (data) {
                    this.switchCoin(item, false);
                } else {
                    item.isOpen = true;
                }
            });
        }
    }

    getCoinTitle(item: EditableCoinInfo) {
        return this.masterWallet.coinService.getCoinByID(item.coin.getID()).getDescription();
    }

    getCoinSubtitle(item: EditableCoinInfo) {
        return this.masterWallet.coinService.getCoinByID(item.coin.getID()).getName();
    }

    getCoinIcon(item: EditableCoinInfo) {
        switch (item.coin.getID()) {
            case 'ELA':
                return "assets/wallet/coins/ela-black.svg";
            case 'IDChain':
                return "assets/wallet/coins/ela-turquoise.svg";
            case 'ETHSC':
                return "assets/wallet/coins/ela-gray.svg";
            default:
                return "assets/wallet/coins/eth-purple.svg";
        }
    }

    // User wants to add a new ERC20 token of his own to the available list of tokens.
    private handleOnAddECR20Coin() {
        this.native.go("/coin-add-erc20");
    }

    public goToCoinDetails(item: EditableCoinInfo) {
        if (item.coin.getType() === CoinType.ERC20) {
            this.native.go('/coin-erc20-details', { coin: item.coin });
        }
    }
}
