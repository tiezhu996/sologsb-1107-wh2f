export const WIRE_MATERIALS = ['竹丝', '铜丝', '马尾丝'] as const
export type WireMaterial = (typeof WIRE_MATERIALS)[number]

export const MOULD_STATES = ['在用', '待修补', '退役'] as const
export type MouldStateValue = (typeof MOULD_STATES)[number]

/**
 * 最近一次修补记录。
 * 合格（实测间距与原帘纹间距相差不超过 0.2 mm）时纸帘转在用；
 * 超差时纸帘留在待修补状态，并在 reason 中写明原因。
 */
export interface MouldRepair {
  repairedAt: string
  measuredGap: number
  deviation: number
  passed: boolean
  reason?: string
}

export interface Mould {
  id?: number
  mouldNo: string
  frameW: number
  frameH: number
  wireMaterial: WireMaterial
  wireDiameter: number
  stripeGap: number
  meshDensity: number
  weaver: string
  state: MouldStateValue
  lastRepair?: MouldRepair
  schemaRev?: number
}

export type MouldInput = Omit<Mould, 'id' | 'schemaRev' | 'lastRepair'>

export interface RepairCompletionInput {
  repairedAt: string
  measuredGap: number
  reason?: string
}
