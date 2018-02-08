import {Injectable} from '@angular/core';
import {Contract, EventEmitter, Tx} from 'web3/types';
import {Web3ProviderService} from '../core/web3-provider.service';
import {merge} from 'lodash';
import Web3 from 'web3';
import {Observable} from 'rxjs/Observable';
import {OrganizationContractAbi} from '../contracts-abi';
import {ConnectableObservable} from 'rxjs/Rx';
import {Observer} from 'rxjs/Observer';

export interface Organization {
	name: string;
	address: string;
	charityEventsCount: number;
}

@Injectable()
export class OrganizationContractService {

	private organizationContract: Contract;
	private web3: Web3;
	private defaultTx: Tx;

	// tracks Observables for different organizations
	// key is organization address
	private charityEventAddedEmiiters: {[key: string]: ConnectableObservable<any>} = {};


	constructor(private web3ProviderService: Web3ProviderService,) {
		this.organizationContract = this.buildOrganizationContract();
		this.web3 = this.web3ProviderService.web3;
		this.init();
	}

	async init(): Promise<void> {
		const accounts: string[] = await this.web3.eth.getAccounts();
		this.defaultTx = {
			from: accounts[0]
		};
	}

	public getName(address: string, txOptions?: Tx): Promise<any> {
		const contract: Contract = this.cloneContract(this.organizationContract, address);
		return contract.methods.name().call(txOptions);
	}

	public getCharityEventsCount(address: string, txOptions?: Tx): Promise<any> {
		const contract: Contract = this.cloneContract(this.organizationContract, address);
		return contract.methods.charityEventCount().call(txOptions);
	}

	public async getOrganization(address: string, txOptions?: Tx): Promise<Organization> {
		return {
			name: await this.getName(address, txOptions),
			address: address,
			charityEventsCount: await this.getCharityEventsCount(address, txOptions)
		}
	}


	public addCharityEvent(address: string, name: string, target: string, payed: string, tags: string, txOptions?: Tx): Promise<any> {
		const contract: Contract = this.cloneContract(this.organizationContract, address);
		const tx: Tx = merge(this.defaultTx, txOptions);
		return contract.methods.addCharityEvent(name, target, payed, tags).send(tx);
	}

	public async getCharityEvents(address: string, txOptions?: Tx): Promise<string[]> {
		const contract: Contract = this.cloneContract(this.organizationContract, address);
		const charityEventCount: string = await contract.methods.charityEventCount().call(txOptions);
		return this.buildCharityEventsList(contract, parseInt(charityEventCount));
	}

	// listen for CharityEventAdded event
	public onCharityEventAdded(address: string): Observable<any> {
		if (!this.charityEventAddedEmiiters[address]) {
			this.charityEventAddedEmiiters[address] = this.buildOnCharityEventAddedObservable(address);
		}

		return this.charityEventAddedEmiiters[address];
	}

	private buildOnCharityEventAddedObservable(address: string): ConnectableObservable<any> {
		const contract: Contract = this.cloneContract(this.organizationContract, address);
		(<any>contract).setProvider(new Web3.providers.WebsocketProvider(environment.websocketProviderUrl));
		return ConnectableObservable.create((observer: Observer<any>) => {
			const contractEventListener: EventEmitter = contract.events.CharityEventAdded({},
				function (error, event) {
					if (error) {
						observer.error(error);
					}
				}
			)
				.on('data', (data: any) => {
					observer.next(data);
				})
				.on('changed', (data: any) => {
					observer.next(data);
				})
				.on('error', (err: any) => {
					observer.error(err);
				});

			return function() {
				(<any>contractEventListener).unsubscribe();
			}

		}).share();
	}

	public addIncomingDonation(address: string, realWorldsIdentifier: string, amount: string, note: string, tags: string, txOptions?: Tx) {
		const contract: Contract = this.cloneContract(this.organizationContract, address);
		const tx: Tx = merge(this.defaultTx, txOptions);
		return contract.methods.setIncomingDonation(realWorldsIdentifier, amount, note, tags).send(tx);
	}

	public async getIncomingDonations(address: string, txOptions?: Tx): Promise<string[]> {
		const contract: Contract = this.cloneContract(this.organizationContract, address);
		const incomingDonationCount: string = await contract.methods.incomingDonationCount().call(txOptions);
		return this.buildIncomingDonationsList(contract, parseInt(incomingDonationCount));
	}

	private async buildCharityEventsList(contract: Contract, charityEventCount: number): Promise<string[]> {
		const result: string[] = [];

		for (let i = 0; i < charityEventCount; i++) {
			const address: string = await contract.methods.charityEventIndex(i).call();
			const isActive: boolean = await contract.methods.charityEvents(address).call();
			(isActive) ? result.push(address) : null;
		}

		return result;
	}

	private async buildIncomingDonationsList(contract: Contract, incomingDonationCount: number): Promise<string[]> {
		const result: string[] = [];

		for (let i = 0; i < incomingDonationCount; i++) {
			const address: string = await contract.methods.incomingDonationIndex(i).call();
			const isActive: boolean = await contract.methods.incomingDonations(address).call();
			(isActive) ? result.push(address) : null;
		}

		return result;
	}


	private cloneContract(original: Contract, address: string): Contract {
		const contract: any = (<any>original).clone();
		const originalProvider = (<any>original).currentProvider;
		contract.setProvider(contract.givenProvider || originalProvider);
		contract.options.address = address;

		return <Contract> contract;
	}

	private buildOrganizationContract(): Contract {
		return new this.web3ProviderService.web3.eth.Contract(OrganizationContractAbi);
	}

}
