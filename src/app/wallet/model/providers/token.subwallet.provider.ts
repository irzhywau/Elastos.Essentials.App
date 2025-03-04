import { Logger } from "src/app/logger";
import { GlobalJsonRPCService } from "src/app/services/global.jsonrpc.service";
import { TokenType } from "../coin";
import { ERCTokenInfo, EthTokenTransaction, EthTransaction } from "../evm.types";
import { ERC20SubWallet } from "../wallets/erc20.subwallet";
import { StandardEVMSubWallet } from "../wallets/evm.subwallet";
import { AnySubWallet } from "../wallets/subwallet";
import { ProviderTransactionInfo } from "./providertransactioninfo";
import { SubWalletTransactionProvider } from "./subwallet.provider";
import { TransactionProvider } from "./transaction.provider";

const MAX_RESULTS_PER_FETCH = 30

/**
 * Root class for all EVM compatible chains to handle ERC20 tokens, as they use the same endpoints to get the list
 * of transactions.
 */
export class EVMSubWalletTokenProvider<SubWalletType extends StandardEVMSubWallet> extends SubWalletTransactionProvider<SubWalletType, EthTransaction> {
  private canFetchMore = true;

  constructor(provider: TransactionProvider<any>, subWallet: SubWalletType, protected rpcApiUrl: string, protected accountApiUrl: string) {
    super(provider, subWallet);
  }

  protected getProviderTransactionInfo(transaction: EthTransaction): ProviderTransactionInfo {
    return {
      cacheKey: this.subWallet.masterWallet.id + "-" + this.subWallet.networkWallet.network.key + "-" + transaction.contractAddress.toLowerCase() + "-transactions",
      cacheEntryKey: transaction.hash,
      cacheTimeValue: parseInt(transaction.timeStamp),
      subjectKey: transaction.contractAddress
    };
  }

  public canFetchMoreTransactions(subWallet: AnySubWallet): boolean {
    return this.canFetchMore;
  }

  public async fetchTransactions(erc20SubWallet: ERC20SubWallet, afterTransaction?: EthTransaction): Promise<void> {
    let page = 1;
    // Compute the page to fetch from the api, based on the current position of "afterTransaction" in the list
    if (afterTransaction) {
      let afterTransactionIndex = (await this.getTransactions(erc20SubWallet)).findIndex(t => t.hash === afterTransaction.hash);
      if (afterTransactionIndex) { // Just in case, should always be true but...
        // Ex: if tx index in current list of transactions is 18 and we use 8 results per page
        // then the page to fetch is 2: Math.floor(18 / 8) + 1 - API page index starts at 1
        page = 1 + Math.floor((afterTransactionIndex + 1) / MAX_RESULTS_PER_FETCH);
      }
    }

    const contractAddress = erc20SubWallet.coin.getContractAddress().toLowerCase();
    const accountAddress = await this.subWallet.createAddress();
    let txListUrl = this.accountApiUrl + '?module=account';
    txListUrl += '&action=tokentx';
    txListUrl += '&page=' + page;
    txListUrl += '&offset=' + MAX_RESULTS_PER_FETCH;
    txListUrl += '&sort=desc';
    txListUrl += '&contractaddress=' + contractAddress;
    txListUrl += '&address=' + accountAddress;

    try {
      let result = await GlobalJsonRPCService.instance.httpGet(txListUrl);
      let transactions = result.result as EthTransaction[];

      if (transactions.length < MAX_RESULTS_PER_FETCH) {
        // Got less results than expected: we are at the end of what we can fetch. remember this
        // (in memory only)
        this.canFetchMore = false;
      } else {
        this.canFetchMore = true;
      }

      await this.saveTransactions(transactions);
    } catch (e) {
      Logger.error('wallet', 'EVMSubWalletTokenProvider fetchTransactions error:', e)
    }
  }

  public async fetchAllTokensTransactions(): Promise<void> {
    let tokenTransactions = await this.getERC20TokenTransferEvents(0);
    if (tokenTransactions) {
      let tokens = await this.getERCTokensFromTransferEvents(tokenTransactions);

      // Let the provider know what we have found
      await this.provider.onTokenInfoFound(tokens);
    }
  }

  /**
   * Can not get the token list directly, So get the token list by token transfer events.
   */
  private async getERCTokensFromTransferEvents(transferEvents: EthTokenTransaction[]) {
    let ercTokens: ERCTokenInfo[] = [];
    let ercTokenContractAddresss = [];
    let ercTokenHasOutgoTxContractAddresss = [];
    const accountAddress = await this.subWallet.getTokenAddress();
    for (let i = 0, len = transferEvents.length; i < len; i++) {
      if (-1 === ercTokenContractAddresss.indexOf(transferEvents[i].contractAddress)) {
        let hasOutgoTx = false;
        if (transferEvents[i].from) {
          hasOutgoTx = accountAddress === transferEvents[i].from.toLowerCase();
        }
        if (hasOutgoTx) {
          ercTokenHasOutgoTxContractAddresss.push(transferEvents[i].contractAddress);
        }
        ercTokenContractAddresss.push(transferEvents[i].contractAddress);
        let token: ERCTokenInfo = {
          balance: '',
          contractAddress: transferEvents[i].contractAddress,
          decimals: transferEvents[i].tokenDecimal,
          name: transferEvents[i].tokenName,
          symbol: transferEvents[i].tokenSymbol,
          type: TokenType.ERC_20,
          hasOutgoTx: hasOutgoTx,
        }
        ercTokens.push(token);
      } else {
        let hasOutgoTx = false;
        if (transferEvents[i].from) {
          hasOutgoTx = accountAddress === transferEvents[i].from.toLowerCase();
        }
        if (hasOutgoTx && (-1 === ercTokenHasOutgoTxContractAddresss.indexOf(transferEvents[i].contractAddress))) {
          ercTokenHasOutgoTxContractAddresss.push(transferEvents[i].contractAddress);
          const index = ercTokens.findIndex(token => token.contractAddress == transferEvents[i].contractAddress);
          ercTokens[index].hasOutgoTx = true;
        }
      }
    }
    //Logger.log('wallet', ' ERC20 Tokens:', ercTokens)
    return ercTokens;
  }

  private async getERC20TokenTransferEvents(startblock: number, endblock = 9999999999): Promise<EthTokenTransaction[]> {
    let tokenSubWallet = this.subWallet;
    const address = await tokenSubWallet.getTokenAddress();
    let tokensEventUrl = this.accountApiUrl + '?module=account&action=tokentx&address=' + address
      + '&startblock=' + startblock + '&endblock=' + endblock;
    try {
      let result = await GlobalJsonRPCService.instance.httpGet(tokensEventUrl);
      return result.result as EthTokenTransaction[];
    } catch (e) {
      Logger.error('wallet', 'getERC20TokenTransferEvents error:', e)
    }
  }
}