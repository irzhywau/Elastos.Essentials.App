import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, Platform } from '@ionic/angular';
import { IonicStorageModule } from '@ionic/storage';
import { TranslateModule } from '@ngx-translate/core';
import { SharedComponentsModule } from 'src/app/components/sharedcomponents.module';
import { ComponentsModule } from './components/components.module';
import { ProposalSearchResultComponent } from './components/proposal-search-result/proposal-search-result.component';
import { CreateProposalPage } from './pages/intents/createproposal/createproposal';
import { CreateSuggestionPage } from './pages/intents/createsuggestion/createsuggestion';
import { ReviewMilestonePage } from './pages/intents/reviewmilestone/reviewmilestone';
import { ReviewProposalPage } from './pages/intents/reviewproposal/reviewproposal';
import { UpdatMilestonePage } from './pages/intents/updatemilestone/updatemilestone';
import { VoteForProposalPage } from './pages/intents/voteforproposal/voteforproposal';
import { WithdrawPage } from './pages/intents/withdraw/withdraw';
import { ProposalDetailPage } from './pages/proposal-detail/proposal-detail';
import { ProposalListPage } from './pages/proposal-list/proposal-list';
import { SuggestionDetailPage } from './pages/suggestion-detail/suggestion-detail';
import { SuggestionListPage } from './pages/suggestion-list/suggestion-list';
import { CRProposalVotingRoutingModule } from './routing';
import { PopupService } from './services/popup.service';

@NgModule({
  declarations: [
    // Pages
    ProposalListPage,
    ProposalDetailPage,
    SuggestionListPage,
    SuggestionDetailPage,

    // Intents,
    CreateSuggestionPage,
    CreateProposalPage,
    ReviewProposalPage,
    VoteForProposalPage,
    UpdatMilestonePage,
    ReviewMilestonePage,
    WithdrawPage,

    // Components
    ProposalSearchResultComponent,
  ],
  imports: [
    CommonModule,
    CRProposalVotingRoutingModule,
    HttpClientModule,
    SharedComponentsModule,
    FormsModule,
    IonicModule,
    IonicStorageModule,
    TranslateModule,
    ComponentsModule,
  ],
  bootstrap: [],
  entryComponents: [
    // Pages
    ProposalListPage,
    ProposalDetailPage,
    SuggestionListPage,
    SuggestionDetailPage,

    // Intents
    CreateSuggestionPage,
    CreateProposalPage,
    ReviewProposalPage,
    VoteForProposalPage,
    UpdatMilestonePage,
    ReviewMilestonePage,
    WithdrawPage,

    // Components
    ProposalSearchResultComponent,
  ],
  providers: [
    Platform,
    PopupService
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CRProposalVotingModule {}
