import { Component, NgZone, ViewChild } from '@angular/core';
import { CROperationsService, CRWebsiteCommand } from '../../../services/croperations.service';
import { PopupService } from '../../../services/popup.service';
import { TitleBarComponent } from 'src/app/components/titlebar/titlebar.component';
import { TranslateService } from '@ngx-translate/core';
import { GlobalIntentService } from 'src/app/services/global.intent.service';
import { Logger } from 'src/app/logger';
import { GlobalNavService } from 'src/app/services/global.nav.service';
import { VoteService } from 'src/app/vote/services/vote.service';
import { WalletManager } from 'src/app/wallet/services/wallet.service';
import { StandardCoinName } from 'src/app/wallet/model/Coin';
import { Util } from 'src/app/model/util';

type WithdrawCommand = CRWebsiteCommand & {
    data: {
        amount: string,
        ownerpublickey: string,
        proposalhash: string,
        recipient: string,
        userdid: string,
    },
}
@Component({
    selector: 'page-withdraw',
    templateUrl: 'withdraw.html',
    styleUrls: ['./withdraw.scss']
})
export class WithdrawPage {
    @ViewChild(TitleBarComponent, { static: false }) titleBar: TitleBarComponent;

    private withdrawCommand: WithdrawCommand;
    public signingAndSendingSuggestionResponse = false;

    constructor(
        private crOperations: CROperationsService,
        private popup: PopupService,
        public translate: TranslateService,
        private globalIntentService: GlobalIntentService,
        private walletManager: WalletManager,
        private voteService: VoteService,
    ) {

    }

    ionViewWillEnter() {
        this.titleBar.setTitle(this.translate.instant('crproposalvoting.withdraw'));
        this.withdrawCommand = this.crOperations.onGoingCommand as WithdrawCommand;
    }

    async signAndWithdraw() {
        this.signingAndSendingSuggestionResponse = true;

        try {
            //Get payload
            var payload = this.getWithdrawPayload(this.withdrawCommand);
            Logger.log('crproposal', "Got payload.", payload);

            //Get digest
            var digest = await this.walletManager.spvBridge.proposalWithdrawDigest(this.voteService.masterWalletId, StandardCoinName.ELA, payload);
            digest = Util.reverseHexToBE(digest);
            Logger.log('crproposal', "Got proposal digest.", digest);

            //Get did sign digest
            let ret = await this.globalIntentService.sendIntent("https://did.elastos.net/signdigest", {
                data: digest,
            });
            Logger.log('crproposal', "Got signed digest.", ret);
            if (!ret.result) {
                // Operation cancelled by user
                return null;
            }

            //Create transaction and send
            payload.Signature = ret.result.signature;
            const rawTx = await this.voteService.sourceSubwallet.createProposalWithdrawTransaction(payload, '');
            await this.voteService.signAndSendRawTransaction(rawTx);
        }
        catch (e) {
            // Something wrong happened while signing the JWT. Just tell the end user that we can't complete the operation for now.
            await this.popup.alert("Error", "Sorry, unable to withdraw. Your crproposal can't be withdraw for now. " + e, "Ok");
        }

        this.signingAndSendingSuggestionResponse = false;
        // this.exitIntentWithSuccess();
    }

    private getWithdrawPayload(command: WithdrawCommand): any {
        let payload = {
            ProposalHash: command.data.proposalhash,
            OwnerPublicKey: command.data.ownerpublickey,
            Recipient: command.data.recipient,
            Amount: command.data.amount,
        };
        return payload;
    }
}