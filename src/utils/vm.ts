import VM from "ethereumjs-vm";
import abi from "ethereumjs-abi";
import { Transaction } from "ethereumjs-tx";
import { promisify } from "util";
import * as util from "ethereumjs-util";
import Account from "ethereumjs-account";
import { Wallet, utils } from "ethers";
import { eventBus } from "./eventBus";

export class JSVM {
  vm = new VM();

  async generateAccount() {
    const account = new Account({ balance: 1e18 * 100 });
    const wallet = Wallet.createRandom();

    const privateKey = wallet.privateKey.replace("0x", "");
    const privateKeyBuffer = Buffer.from(privateKey, "hex");
    const addressBuffer = util.privateToAddress(privateKeyBuffer);

    await this.vm.pStateManager.putAccount(addressBuffer, account);
    return {
      address: wallet.address,
      addressBuffer,
      privateKey,
      privateKeyBuffer,
      account
    };
  }

  async getAccountNonce(accountPrivateKey: Buffer) {
    const account = (await this.vm.pStateManager.getAccount(util.privateToAddress(accountPrivateKey))) as Account;
    return account.nonce;
  }

  async deplyContract({
    senderPrivateKey,
    bytecode,
    types = [],
    datas = [],
    gasLimit = 3000000,
    gasPrice = 1,
    value = 0
  }: {
    senderPrivateKey: Buffer;
    bytecode: Buffer;
    types: string[];
    datas: string[];
    gasLimit?: number;
    gasPrice?: number;
    value?: number;
  }): Promise<string> {
    const params = abi.rawEncode(types, datas);
    const nonce = await this.getAccountNonce(senderPrivateKey);
    let data = "0x" + bytecode.toString("hex") + params.toString("hex");

    const tx = new Transaction({
      value,
      gasLimit,
      gasPrice,
      data,
      nonce
    });

    tx.sign(senderPrivateKey);
    const deploymentResult = await this.vm.runTx({ tx });
    if (deploymentResult.execResult.exceptionError) {
      throw deploymentResult.execResult.exceptionError;
    }

    return util.bufferToHex(deploymentResult.createdAddress);
  }

  async readContract({ contractAddress, callerAddress, types, datas, method }: { method: string; contractAddress: string; callerAddress: string; types?: string[]; datas?: string[] }) {
    const params = abi.rawEncode(types, datas);
    let data = "0x" + abi.methodID(method, types).toString("hex") + params.toString("hex");

    const _contractAddress = util.toBuffer(contractAddress);
    const _callerAddress = util.toBuffer(callerAddress);
    const result = await this.vm.runCall({
      to: _contractAddress,
      caller: _callerAddress,
      origin: _callerAddress,
      data: util.toBuffer(data)
    });

    eventBus.emit("term.message", {
      text: `call from: ${callerAddress} to:${contractAddress} data:${data} `
    });

    if (result.execResult.exceptionError) {
      throw result.execResult.exceptionError;
    }
    return result;
  }

  async interactContract({
    gasLimit = 2000000,
    gasPrice = 1,
    value = 0,
    senderPrivateKey,
    contractAddress,
    types = [],
    datas = [],
    method
  }: {
    method: string;
    senderPrivateKey: Buffer;
    contractAddress: string;
    types?: string[];
    datas?: string[];
    gasLimit?: number;
    gasPrice?: number;
    value?: number;
  }) {
    const params = abi.rawEncode(types, datas);
    const nonce = await this.getAccountNonce(senderPrivateKey);
    let data = "0x" + abi.methodID(method, types).toString("hex") + params.toString("hex");
    const _contractAddress = util.toBuffer(contractAddress);

    const tx = new Transaction({
      to: _contractAddress,
      value,
      gasLimit,
      gasPrice,
      data,
      nonce
    });

    tx.sign(senderPrivateKey);
    const result = await this.vm.runTx({ tx });
    eventBus.emit("term.message", {
      text: `call from: ${tx.getSenderAddress().toString("hex")} to:${tx.to.toString("hex")} data:${tx.data.toString("hex")} `
    });

    if (result.execResult.exceptionError) {
      throw result.execResult.exceptionError;
    }
    return result;
  }
}

export const jsvm = new JSVM();
