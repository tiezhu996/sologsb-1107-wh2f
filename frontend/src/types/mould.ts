export const WIRE_MATERIALS = ['竹丝', '铜丝', '马尾丝'] as const
export type WireMaterial = (typeof WIRE_MATERIALS)[number]

export const MOULD_STATES = ['在用', '待修补', '退役'] as const
export type MouldStateValue = (typeof MOULD_STATES)[number]

/** 最近一次纸帘修补记录，只保留最近一次（再次修补时整体覆盖） */
export interface MouldRepair {
  /** 修补日期（ISO yyyy-MM-dd） */
  repairDate: string
  /** 修补前登记的原帘纹间距 mm */
  standardGap: number
  /** 修补后实测帘纹间距 mm */
  measuredGap: number
  /** 实测间距相对原间距的偏差 mm */
  deviation: number
  /** 是否通过 ±0.2 mm 判定，通过则转在用 */
  passed: boolean
  /** 超差未通过时写明的原因 */
  failReason?: string
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
  /** 最近一次修补信息，含实测间距与是否合格 */
  lastRepair?: MouldRepair
  schemaRev?: number
}

export type MouldInput = Omit<Mould, 'id' | 'schemaRev' | 'lastRepair'>
