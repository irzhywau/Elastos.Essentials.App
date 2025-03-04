import { MAINNET_TEMPLATE } from "src/app/services/global.networks.service";
import { ERC20Coin } from "../../coin";
import { EVMNetwork } from "../evm.network";
import { UniswapCurrencyProvider } from "../uniswap.currencyprovider";
import { BscAPI, BscApiType } from "./bsc.api";
import { BscMainnetUniswapCurrencyProvider } from "./currency/bsc.uniswap.currency.provider";
import { bscMainnetBinanceBridgeProvider, bscMainnetElkBridgeProvider, bscMainnetShadowTokenBridgeProvider } from "./earn/bridge.providers";
import { bscMainnetElkEarnProvider } from "./earn/earn.providers";
import { bscMainnetElkSwapProvider, bscMainnetMdexSwapProvider } from "./earn/swap.providers";

export class BSCMainNetNetwork extends EVMNetwork {
  private uniswapCurrencyProvider: BscMainnetUniswapCurrencyProvider = null;

  constructor() {
    super(
      "bsc",
      "BSC",
      "assets/wallet/networks/bscchain.png",
      "BNB",
      "Binance Coin",
      BscAPI.getApiUrl(BscApiType.RPC, MAINNET_TEMPLATE),
      BscAPI.getApiUrl(BscApiType.EXPLORER, MAINNET_TEMPLATE),
      MAINNET_TEMPLATE,
      56,
      [
        new ERC20Coin("ETH", "Binance ETH", "0x2170ed0880ac9a755fd29b2688956bd959f933f8", 18, MAINNET_TEMPLATE, false, true),
        new ERC20Coin("ADA", "Binance ADA", "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47", 18, MAINNET_TEMPLATE, false),
        new ERC20Coin("USDT", "Binance USDT", "0x55d398326f99059ff775485246999027b3197955", 18, MAINNET_TEMPLATE, false, true)
      ],
      [
        bscMainnetElkEarnProvider
      ],
      [
        bscMainnetMdexSwapProvider,
        bscMainnetElkSwapProvider
      ],
      [
        bscMainnetBinanceBridgeProvider,
        bscMainnetShadowTokenBridgeProvider,
        bscMainnetElkBridgeProvider
      ]
    );

    this.uniswapCurrencyProvider = new BscMainnetUniswapCurrencyProvider();
    this.averageBlocktime = 5 // 3;
  }

  public getUniswapCurrencyProvider(): UniswapCurrencyProvider {
    return this.uniswapCurrencyProvider;
  }
}
