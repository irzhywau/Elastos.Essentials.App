import { Component, OnInit, NgZone } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MasterWallet, Theme } from '../../../model/wallets/MasterWallet';
import { WalletManager } from '../../../services/wallet.service';
import { WalletEditionService } from '../../../services/walletedition.service';
import { Native } from '../../../services/native.service';
import { AppService } from '../../../services/app.service';
import { GlobalThemeService } from 'src/app/services/global.theme.service';

@Component({
  selector: 'app-wallet-color',
  templateUrl: './wallet-color.page.html',
  styleUrls: ['./wallet-color.page.scss'],
})
export class WalletColorPage implements OnInit {

  public masterWallet: MasterWallet = null;
  public walletTheme: Theme = {
    color: '#752fcf',
    background: '/assets/wallet/cards/maincards/card-purple.svg'
  };

  public themes: Theme[] = [
    {
      color: '#752fcf',
      background: '/assets/wallet/cards/maincards/card-purple.svg'
    },
    {
      color: '#fdab94',
      background: '/assets/wallet/cards/maincards/card-pink.svg'
    },
    {
      color: '#4035cf',
      background: '/assets/wallet/cards/maincards/card-blue.svg'
    },
    {
      color: '#f5728e',
      background: '/assets/wallet/cards/maincards/card-red.svg'
    },
    {
      color: '#e6b54a',
      background: '/assets/wallet/cards/maincards/card-yellow.svg'
    },
    {
      color: '#18cece',
      background: '/assets/wallet/cards/maincards/card-lightblue.svg'
    },
    {
      color: '#36d67d',
      background: '/assets/wallet/cards/maincards/card-green.svg'
    },
  ];

  constructor(
    public themeService: GlobalThemeService,
    public translate: TranslateService,
    private walletManager: WalletManager,
    private walletEditionService: WalletEditionService,
    public native: Native,
    public ngZone: NgZone,
    private appService: AppService
  ) { }

  ngOnInit() {
    this.getTheme();

  }

  ionViewWillEnter() {
    this.appService.setTitleBarTitle(this.translate.instant("change-wallet-theme-title"));
  }

  getTheme() {
    this.masterWallet = this.walletManager.getMasterWallet(this.walletEditionService.modifiedMasterWalletId);
    if (this.masterWallet.theme) {
      this.walletTheme = this.masterWallet.theme;
    }
    console.log('Setting theme for master wallet ', this.masterWallet);
    console.log('Current wallet theme ', this.walletTheme);
  }

  async confirm() {
    if (this.walletTheme) {
      this.masterWallet.theme = this.walletTheme;
    } else {
      this.masterWallet.theme = {
        color: '#752fcf',
        background: '/assets/wallet/cards/maincards/card-purple.svg'
      };
    }

    await this.walletManager.saveMasterWallet(this.masterWallet);
    this.native.pop();
  }

}
