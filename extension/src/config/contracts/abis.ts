export const BRIDGECORE_ABI = [
  {
    type: "function",
    name: "getChannelState",
    inputs: [{ name: "channelId", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "", type: "uint8", internalType: "enum BridgeCore.ChannelState" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getChannelLeader",
    inputs: [{ name: "channelId", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getChannelParticipants",
    inputs: [{ name: "channelId", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getChannelInfo",
    inputs: [{ name: "channelId", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "targetContract", type: "address", internalType: "address" },
      {
        name: "state",
        type: "uint8",
        internalType: "enum BridgeCore.ChannelState",
      },
      { name: "participantCount", type: "uint256", internalType: "uint256" },
      { name: "initialRoot", type: "bytes32", internalType: "bytes32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getL2MptKey",
    inputs: [
      { name: "channelId", type: "bytes32", internalType: "bytes32" },
      { name: "participant", type: "address", internalType: "address" },
      { name: "slotIndex", type: "uint8", internalType: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isChannelWhitelisted",
    inputs: [
      { name: "channelId", type: "bytes32", internalType: "bytes32" },
      { name: "addr", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getValidatedUserSlotValue",
    inputs: [
      { name: "channelId", type: "bytes32", internalType: "bytes32" },
      { name: "participant", type: "address", internalType: "address" },
      { name: "slotIndex", type: "uint8", internalType: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const BRIDGEDEPOSITMANAGER_ABI = [
  {
    type: "function",
    name: "depositToken",
    inputs: [
      { name: "_channelId", type: "bytes32", internalType: "bytes32" },
      { name: "_amount", type: "uint256", internalType: "uint256" },
      { name: "_mptKeys", type: "bytes32[]", internalType: "bytes32[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      {
        name: "channelId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      { name: "user", type: "address", indexed: true, internalType: "address" },
      {
        name: "token",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;
