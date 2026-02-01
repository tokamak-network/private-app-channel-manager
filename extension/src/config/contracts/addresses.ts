export const CONTRACT_ADDRESSES = {
  sepolia: {
    TokamakVerifier: "0x87d51311a936b940578116b70592ad6eb8b5f830",
    Groth16Verifier16Leaves: "0xc167f315aef4319a686b7728e8de71f9da3f62bc",
    Groth16Verifier32Leaves: "0xb86b79c36b8eacc669e12f235f36d6bee1d40eff",
    Groth16Verifier64Leaves: "0x64ba1c608b794537499b973b3b97e2d01edeabf6",
    Groth16Verifier128Leaves: "0x91bc1281733aaf2bbf7f45e0098f9e0439f459dd",
    ZecFrost: "0x910eee98a93d54ad52694cbf2b45b1534c8c8d10",
    BridgeCore: "0xb6674f250b33cd35a89dbfbaf473645970bfdaf7",
    BridgeDepositManager: "0xc430477c58fd96243ea07e90cc3c517857492e91",
    BridgeProofManager: "0xfdb96f02a562947b527867a86632bd865ceb4576",
    BridgeWithdrawManager: "0x1247aece17bc89f5bf6b170710a988200c7582ae",
    BridgeAdminManager: "0xdef74170cd7cf0a427606a1ce015b6bde22eb17e",
  } as const,
} as const;

export type Network = keyof typeof CONTRACT_ADDRESSES;
export type ContractName<T extends Network> =
  keyof (typeof CONTRACT_ADDRESSES)[T];

export function getContractAddress(
  contractName: keyof (typeof CONTRACT_ADDRESSES)["sepolia"],
  network: Network = "sepolia"
): `0x${string}` {
  return CONTRACT_ADDRESSES[network][contractName] as `0x${string}`;
}
