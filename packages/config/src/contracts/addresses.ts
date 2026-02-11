/**
 * Contract Addresses
 * 
 * Auto-generated from Tokamak-zk-EVM-contracts repository
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

export const CONTRACT_ADDRESSES = {
  sepolia: {
    TokamakVerifier: '0x87d51311A936b940578116b70592aD6Eb8B5F830',
    Groth16Verifier16Leaves: '0xc167F315Aef4319A686B7728e8DE71f9dA3f62Bc',
    Groth16Verifier32Leaves: '0xB86b79c36b8Eacc669E12F235F36D6BEe1d40eFf',
    Groth16Verifier64Leaves: '0x64ba1c608b794537499b973B3b97E2D01eDeabf6',
    Groth16Verifier128Leaves: '0x91Bc1281733aAF2bbF7f45E0098f9e0439F459dD',
    BridgeCore: '0xb6674F250b33cD35a89dBfBaf473645970bFdAf7',
    BridgeDepositManager: '0xC430477c58FD96243ea07e90Cc3C517857492E91',
    BridgeProofManager: '0xfDb96F02a562947b527867a86632bD865cEB4576',
    BridgeWithdrawManager: '0x1247AeCE17bC89f5bF6b170710A988200c7582AE',
    BridgeAdminManager: '0xDEF74170Cd7CF0a427606a1CE015B6bdE22eb17e',
  } as const,
} as const;

export type Network = keyof typeof CONTRACT_ADDRESSES;
export type ContractName<T extends Network> = keyof typeof CONTRACT_ADDRESSES[T];
