import { Component, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { TitleBarIconSlot, TitleBarNavigationMode } from 'src/app/components/titlebar/titlebar.types';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {
  @ViewChild(TitleBarComponent, { static: false }) titleBar: TitleBarComponent;

  constructor(
    public theme: GlobalThemeService,
    public translate: TranslateService
  ) { }

  ngOnInit() {
  }

  ionViewWillEnter() {
    this.titleBar.setTitle(this.translate.instant('settings'));
    this.titleBar.setNavigationMode(TitleBarNavigationMode.BACK);
    this.titleBar.setIcon(TitleBarIconSlot.OUTER_RIGHT, null);
  }

}
