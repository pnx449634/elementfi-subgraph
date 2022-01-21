import { TrancheCreated as TrancheCreatedEvent} from "../generated/TrancheFactory/TrancheFactory"
import { Tranche as TrancheContract } from "../generated/TrancheFactory/Tranche"
import { Transfer as TransferEvent } from "../generated/templates/Tranche/Tranche"

import { InterestTokenCreated as InterestTokenCreatedEvent} from "../generated/InterestTokenFactory/InterestTokenFactory"
import {  InterestToken as InterestTokenContract } from "../generated/InterestTokenFactory/InterestToken"
import { Transfer as InterestTokenTransferEvent } from "../generated/templates/InterestToken/InterestToken"

import { CCPoolCreated as CCPoolCreatedEvent } from "../generated/ConvergentPoolFactory/ConvergentPoolFactory"
import { ConvergentPool as ConvergentPoolContract } from "../generated/ConvergentPoolFactory/ConvergentPool"

import { PoolCreated as WeightedPoolCreatedEvent } from "../generated/WeightedPoolFactory/WeightedPoolFactory"
import { WeightedPool as WeightedPoolContract } from "../generated/WeightedPoolFactory/WeightedPool"

import { Tranche, InterestToken, ConvergentPool, WeightedPool, Account, Deposit } from "../generated/schema"
import {  InterestToken as InterestTokenTemplate, Tranche as TrancheTemplate} from "../generated/templates"

import { ZERO_ADDRESS, BALANCERV2_VAULT, ELEMENT_YIELD_TOKEN_SUBSTRING } from "./constants"
import { log, Bytes } from "@graphprotocol/graph-ts"

export function handleTrancheCreated(event: TrancheCreatedEvent): void {
  let trancheContract = TrancheContract.bind(event.params.trancheAddress)
  
  //create Tranche entity
  let tranche = new Tranche(event.params.trancheAddress.toHexString())
  tranche.block = event.block.number
  tranche.address = event.params.trancheAddress
  tranche.createdAt = event.block.timestamp
  tranche.transaction = event.transaction.hash
  tranche.name = trancheContract.name()
  tranche.symbol = trancheContract.symbol()
  tranche.underlying = trancheContract.underlying()
  tranche.interestToken = trancheContract.interestToken()
  tranche.wrappedPosition = event.params.wpAddress
  tranche.expiration = event.params.expiration
  tranche.save()

  //create Tranche token to be indexed
  TrancheTemplate.create(event.params.trancheAddress)
}

export function handleInterestTokenCreated(event: InterestTokenCreatedEvent): void {
  let interestTokenContract = InterestTokenContract.bind(event.params.token)
  
  //create InterestToken entity
  let interestToken = new InterestToken(event.params.token.toHexString())
  interestToken.createdAt = event.block.timestamp
  interestToken.block = event.block.number
  interestToken.transaction = event.transaction.hash
  interestToken.name = interestTokenContract.name()
  interestToken.symbol = interestTokenContract.symbol()
  interestToken.address = event.params.token
  interestToken.tranche = event.params.tranche
  interestToken.save()

  //create Interest token to be indexed
  InterestTokenTemplate.create(event.params.token)
}

export function handleCCPoolCreated(event: CCPoolCreatedEvent): void {
  let convergentPool = new ConvergentPool(event.params.pool.toHexString())
  let convergentPoolContract = ConvergentPoolContract.bind(event.params.pool)
  log.info("Bond Token Param {}, ConvergentPoolBond {}", [event.params.bondToken.toHexString(), convergentPoolContract.bond().toHexString()])
 
  convergentPool.createdAt = event.block.timestamp
  convergentPool.block = event.block.number
  convergentPool.transaction = event.transaction.hash
  convergentPool.address = event.params.pool
  convergentPool.poolID = convergentPoolContract.getPoolId()
  convergentPool.bptName = convergentPoolContract.name()
  convergentPool.bptSymbol = convergentPoolContract.symbol()
  convergentPool.underlying = convergentPoolContract.underlying()
  convergentPool.bond = event.params.bondToken
  convergentPool.expiration = convergentPoolContract.expiration()
  convergentPool.save()
}

export function handleWeightedPoolCreated(event: WeightedPoolCreatedEvent): void {
  let weightedPool = new WeightedPool(event.params.pool.toHexString())
  let weightedPoolContract = WeightedPoolContract.bind(event.params.pool)
  
  let name = weightedPoolContract.name()
  //Filter only for Element Yield Tokens
  if(!name.includes(ELEMENT_YIELD_TOKEN_SUBSTRING)){
    log.info("Skipping weighted pool, not Element yield pool tx {}\naddress: {}", [event.transaction.hash.toHexString(), weightedPoolContract._address.toHexString()])
    return
  }
  log.info("Element Yield Token Weighted Pool created, tx {}, address: {}", [event.transaction.hash.toHexString(), weightedPoolContract._address.toHexString()])

  weightedPool.createdAt = event.block.timestamp
  weightedPool.block = event.block.number
  weightedPool.transaction = event.transaction.hash
  weightedPool.address = event.params.pool
  weightedPool.poolID = weightedPoolContract.getPoolId()
  weightedPool.bptName = weightedPoolContract.name()
  weightedPool.bptSymbol = weightedPoolContract.symbol()
  weightedPool.save()
}

export function handleDeposit(event: TransferEvent, name: string, symbol: string, address: Bytes): void {
  
  //unpack frequently used params
  let from = event.params.from
  let to = event.params.to
  let amount = event.params.value
  let hash = event.transaction.hash
  let block = event.block.number
  let timestamp = event.block.timestamp

  //only track mints and swaps
  if(from.toHexString() != BALANCERV2_VAULT && from.toHexString() != ZERO_ADDRESS){
    log.info("Not mint or swap, skipping: tx {}, sender {}, receiver {}", [hash.toHexString(), from.toHexString(), to.toHexString()])
    return
  }

  //if the Transfer is from ZERO_ADDRESS, then we know a mint event is occurring, otherwise swap or LP liquidity exit from a pool
  let depositType = from.toHexString() == ZERO_ADDRESS ? "MINT" : "SWAP_OR_WITHDRAWAL"
  log.info("{}: tx {}, sender {}, receiver {}", [depositType, hash.toHexString(), from.toHexString(), to.toHexString()])

  //handle deposit
  let deposit = new Deposit(to.toHexString() + event.address.toHexString() + event.transaction.hash.toHexString())

  deposit.depositor = to
  deposit.depositType = depositType
  deposit.timestamp = timestamp
  deposit.block = block
  deposit.transaction = hash
  deposit.amount = amount
  deposit.tokenName = name 
  deposit.tokenSymbol = symbol
  deposit.tokenAddress = address
  
  deposit.save()
  
  //create or update account
  let accountID = to.toHexString()
  let account = Account.load(accountID)

  if(!account){
    account = new Account(accountID)
    account.address = to    
  }

  //update deposit array, can't update in place
  //see https://thegraph.com/docs/developer/assemblyscript-api#store-api
  let deposits = account.deposits
  deposits.push(deposit.id)
  account.deposits = deposits
  account.save()  
}

export function handleTrancheTransfer(event: TransferEvent): void {

  let token = Tranche.load(event.address.toHexString())
  
  //this should not occur, since a transfer can only occur once a tranche has already been created
  if(!token){
    log.info("Token not found at tx {}", [event.transaction.hash.toHexString()])
    return
  }
  let tokenName = token.name 
  let tokenAddress = token.address
  let tokenSymbol = token.symbol

  handleDeposit(event, tokenName, tokenSymbol, tokenAddress)
}

export function handleInterestTokenTransfer(event: TransferEvent): void {
  let token = InterestToken.load(event.address.toHexString())
  
  //this should not occur, since a transfer can only occur once a yield token has already been created
  if(!token){
    log.info("Token not found at tx {}", [event.transaction.hash.toHexString()])
    return
  }
  let tokenName = token.name 
  let tokenAddress = token.address
  let tokenSymbol = token.symbol
  
  handleDeposit(event, tokenName, tokenSymbol, tokenAddress)
 }
