import { Component, OnInit, ViewChild } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { NodesService } from '../../services/nodes.service';
import { Node } from '../../model/nodes.model';
import { TranslateService } from '@ngx-translate/core';
import { Logger } from 'src/app/logger';
import { GlobalIntentService } from 'src/app/services/global.intent.service';
import { TitleBarForegroundMode } from 'src/app/components/titlebar/titlebar.types';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { GlobalThemeService } from 'src/app/services/global.theme.service';
import { GlobalStorageService } from 'src/app/services/global.storage.service';
import { GlobalDIDSessionsService } from 'src/app/services/global.didsessions.service';
import { GlobalNativeService } from 'src/app/services/global.native.service';


@Component({
  selector: 'app-vote',
  templateUrl: './vote.page.html',
  styleUrls: ['./vote.page.scss'],
})
export class VotePage implements OnInit {
  @ViewChild(TitleBarComponent, { static: false }) titleBar: TitleBarComponent;

  // Values
  public selectedNodes: number = 0;

  // Intent
  public voted: boolean = false;

  // Node Detail
  public showNode: boolean = false;
  public nodeIndex: number;
  public node: Node;

  // Toast for voteFailed/voteSuccess
  private toast: any = null;

  constructor(
    public nodesService: NodesService,
    private storage: GlobalStorageService,
    private toastController: ToastController,
    private translate: TranslateService,
    private globalNative: GlobalNativeService,
    private globalIntentService: GlobalIntentService,
    public theme: GlobalThemeService
  ) {
  }

  ngOnInit() {
  }

  ionViewWillEnter() {
    this.titleBar.setTitle(this.translate.instant('launcher.app-dpos-voting'));
    this.titleBar.setTheme('#732dcf', TitleBarForegroundMode.LIGHT);
    this.titleBar.setNavigationMode(null);
  }

  ionViewWillLeave() {
    if(this.toast) {
      this.toast.dismiss();
    }
  }

  //// Vote intent ////
  async castVote() {
    let castedNodeKeys: string[] = [];
    this.nodesService._nodes.map(node => {
      if (node.isChecked === true) {
        castedNodeKeys = castedNodeKeys.concat(node.ownerpublickey);
      }
    });

    if (castedNodeKeys.length > 0) {
      Logger.log('dposvoting', 'castedNodeKeys:', castedNodeKeys);
      this.storage.setSetting(GlobalDIDSessionsService.signedInDIDString, "dposvoting", "nodes", castedNodeKeys);
      let votesSent: boolean = false;

      try {
        let res = await this.globalIntentService.sendIntent(
          "https://wallet.elastos.net/dposvotetransaction",
          { publickeys: (castedNodeKeys) });

        Logger.log('dposvoting', 'Insent sent sucessfully', res);

        if(!res.result.txid) {
          votesSent = true;
          this.voteFailed('dposvoting.vote-cancelled');
        } else {
          votesSent = true;
          this.voted = true;
          let date = new Date;
          let txid: string = res.result.txid;

          this.nodesService._votes = this.nodesService._votes.concat({ date: date, tx: txid, keys: castedNodeKeys });
          Logger.log('dposvoting', 'Vote history updated', this.nodesService._votes);
          this.storage.setSetting(GlobalDIDSessionsService.signedInDIDString, "dposvoting", "votes", this.nodesService._votes);
          this.voteSuccess(res.result.txid);
        }
      }
      catch (err) {
          votesSent = true;
          Logger.log('dposvoting', 'Intent sent failed', err);
          this.voteFailed(err);
      }

      // If no response is sent from wallet, show vote transaction has failed
      setTimeout(() => {
        if(votesSent === false) {
          this.voteFailed('dposvoting.vote-timeout');
        }
      }, 10000)

    } else {
      this.noNodesChecked();
    }
  }

  //// Define Values ////
  getVotes(votes: string): string {
    const fixedVotes: number = parseInt(votes);
    return fixedVotes.toLocaleString().split(/\s/).join(',');
  }

  getSelectedNodes(): number {
    this.selectedNodes = 0;
    this.nodesService._nodes.map(node => {
      if (node.isChecked === true) {
        this.selectedNodes++;
      }
    });
    return this.selectedNodes;
  }

  getVotePercent(votes: string): string {
    const votePercent: number = parseFloat(votes) / this.nodesService.totalVotes * 100;
    return votePercent.toFixed(2);
  }

  //// Node Detail ////
  _showNode(index: number, node: Node) {
    this.showNode = !this.showNode;
    this.nodeIndex = index;
    this.node = node;
  }

  return() {
    this.showNode = false;
  }

  async voteSuccess(txid: string) {
    this.closeToast();
    this.toast = await this.toastController.create({
      position: 'bottom',
      header: this.translate.instant('common.vote-success'),
      message: `${txid.slice(0,16) + '<br>' + txid.slice(16,32) + '<br>' + txid.slice(32,48)}`,
      color: "primary",
      buttons: [
        {
          text: this.translate.instant('common.copy'),
          handler: () => {
            this.toast.dismiss();
            this.globalNative.genericToast('dposvoting.tx-copied-to-clipboard');
            this.globalNative.copyClipboard(txid);
          }
        },
        {
          text: this.translate.instant('common.dismiss'),
          handler: () => {
            this.toast.dismiss();
          }
        },
      ],
    });
    this.toast.onWillDismiss(() => {
      this.toast = null;
    })
    this.toast.present();
  }

  async voteFailed(res: string) {
    this.closeToast();
    this.toast = await this.toastController.create({
      position: 'bottom',
      header: this.translate.instant('dposvoting.vote-fail'),
      message: this.translate.instant(res),
      color: "primary",
      buttons: [
        {
          text: this.translate.instant('common.ok'),
          handler: () => {
            this.toast.dismiss();
          }
        }
      ]
    });
    this.toast.onWillDismiss(() => {
      this.toast = null;
    })
    this.toast.present();
  }

  // If we get response from sendIntent, we need to close the toast showed for timeout
  closeToast() {
    if (this.toast) {
      this.toast.dismiss();
      this.toast = null;
    }
  }

  async noNodesChecked() {
    const toast = await this.toastController.create({
      position: 'bottom',
      header: this.translate.instant('dposvoting.vote-no-nodes-checked'),
      color: "primary",
      duration: 2000
    });
    toast.present();
  }
}


