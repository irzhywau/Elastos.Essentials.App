import { Component, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { NavController, IonSlides, Platform, ModalController } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { Router } from '@angular/router';
import { DrawerState } from 'ion-bottom-drawer';

import { Util } from 'src/app/didsessions/services/util';
import { Styling } from 'src/app/didsessions/services/styling';
import { IdentityService } from 'src/app/didsessions/services/identity.service';
import { UXService } from 'src/app/didsessions/services/ux.service';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { GlobalDIDSessionsService } from 'src/app/services/global.didsessions.service';

@Component({
  selector: 'page-createidentity',
  templateUrl: 'createidentity.html',
  styleUrls: ['./createidentity.scss']
})
export class CreateIdentityPage {
  @ViewChild(IonSlides, { static: false }) private slide: IonSlides;

  public hidden = true;
  public slideIndex = 0;
  public slideOpts = {
    initialSlide: 0,
    speed: 400,
    init: false
  };

  public isfirst: boolean = true;
  public styling = Styling;

  public passwordSheetState = DrawerState.Bottom;
  public passwordSheetMinHeight = 0;
  public passwordSheetDockedHeight = 350;
  public password: string = "";
  public passwordConfirmation: string = "";

  constructor(
    public router: Router,
    private platform: Platform,
    private modalCtrl: ModalController,
    private identityService: IdentityService,
    private uxService: UXService,
    private translate: TranslateService,
    public theme: GlobalThemeService,
    private splashScreen: SplashScreen,
    private didSessions: GlobalDIDSessionsService
  ) {
    const navigation = this.router.getCurrentNavigation();
    if (!Util.isEmptyObject(navigation.extras.state)) {
      this.isfirst = false;
      console.log("Setting create identity screen initial slide to index 1");
      this.slideOpts.initialSlide = 1;
    }
  }

  ionViewWillEnter() {
    // Update system status bar every time we re-enter this screen.
    // TODO @chad titleBarManager.setTitle(this.translate.instant("create-identity"));
    this.uxService.setTitleBarEditKeyShown(true);
    this.checkForIdentities();

    // Dirty hack because on iOS we are currently unable to understand why the
    // ion-slides width is sometimes wrong when an app starts. Waiting a few
    // seconds (DOM fully rendered once...?) seems to solve this problem.
    if (this.platform.platforms().indexOf('ios') >= 0) {
      setTimeout(() => {
        this.showSlider();
      }, 300)
    } else {
      this.showSlider();
    }
  }

  ionViewDidEnter() {
    // We are ready, we can hide the splash screen
    this.splashScreen.hide();
  }

  ionViewWillLeave() {
    this.uxService.setTitleBarBackKeyShown(false);
  }

  showSlider() {
    console.log("Showing created identity screen slider");
    this.hidden = false
    this.slide.getSwiper().then((swiper) => {
      swiper.init();
    });
  }

  async getActiveSlide() {
    this.slideIndex = await this.slide.getActiveIndex();
  }

  nextSlide() {
    this.slide.slideNext();
  }

  async checkForIdentities() {
    const identities = await this.didSessions.getIdentityEntries();
    if (identities.length) {
      /* TODO @chad titleBarManager.setIcon(TitleBarPlugin.TitleBarIconSlot.INNER_LEFT, {
        key: "backToIdentities",
        iconPath: TitleBarPlugin.BuiltInIcon.BACK
      });*/
    }
  }

  async createNewIdentity() {
    this.identityService.startCreatingNewDIDWithNewMnemonic();
  }

  async importIdentity(existingMnemonic: string = null) {
    // Import by typing a mnemonic or from an existing one (wallet)
    await this.identityService.startImportingMnemonic(existingMnemonic);
  }

  shouldShowBack() {
    return !this.isfirst;
  }
}
