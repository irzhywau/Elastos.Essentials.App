import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { MenuPage } from './menu.page';

const routes: Routes = [
  {
    path: 'menu',
    component: MenuPage,
    children: [
      {
        path: 'vote',
        loadChildren: '../vote/vote.module#VotePageModule'
      },
      {
        path: 'stats',
        loadChildren: '../stats/stats.module#StatsPageModule'
      },
      {
        path: 'search',
        loadChildren: '../search/search.module#SearchPageModule'
      },
      {
        path: 'history',
        loadChildren: '../history/history.module#HistoryPageModule'
      },
      {
        path: 'history/:txId',
        loadChildren: '../tx/tx.module#TxPageModule'
      },
    ]
  },
  {
    path: 'home',
    loadChildren: '../home/home.module#HomePageModule'
  },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [MenuPage]
})
export class MenuPageModule {}
