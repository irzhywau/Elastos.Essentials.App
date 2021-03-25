import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SharedComponentsModule } from 'src/app/components/sharedcomponents.module';
import { CoinAddressPage } from './coin-address.page';

@NgModule({
    declarations: [CoinAddressPage],
    imports: [
        SharedComponentsModule,
        CommonModule,
        TranslateModule,
        RouterModule.forChild([{ path: '', component: CoinAddressPage }])
    ],
    exports: [RouterModule],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CoinAddressModule {}