import { create } from 'zustand'
import type { Mould, MouldInput, MouldRepair, MouldStateValue } from '../types/mould'
import { db, plain } from '../utils/db'
import { calculateDeviation, isGapOutOfTolerance } from '../utils/stripe'

export interface CompleteRepairInput {
  repairDate: string
  measuredGap: number
  failReason?: string
}

export interface CompleteRepairResult {
  ok: boolean
  passed?: boolean
  error?: string
}

interface MouldStore {
  moulds: Mould[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadMoulds: () => Promise<void>
  addMould: (input: MouldInput) => Promise<Mould | null>
  setMouldState: (id: number, state: MouldStateValue) => Promise<void>
  /** 完成修补：填写修补日期与实测间距，按 ±0.2 mm 判定转在用或留在待修补，并覆盖保存最近一次修补信息 */
  completeRepair: (id: number, input: CompleteRepairInput) => Promise<CompleteRepairResult>
}

export const useMouldStore = create<MouldStore>((set, get) => ({
  moulds: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadMoulds: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const moulds = await db.moulds.orderBy('mouldNo').toArray()
      set({ moulds, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '纸帘台帐读取失败，请检查浏览器存储权限' })
    }
  },
  addMould: async (input) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const id = Number(await db.moulds.add(payload))
      const created: Mould = { ...payload, id, schemaRev: 3 }
      set((state) => ({ moulds: [created, ...state.moulds] }))
      return created
    } catch {
      set({ error: '纸帘登记失败，请检查编号是否重复' })
      return null
    }
  },
  setMouldState: async (id, nextState) => {
    try {
      await db.moulds.update(id, { state: nextState, schemaRev: 3 })
      set((state) => ({
        moulds: state.moulds.map((mould) => (mould.id === id ? { ...mould, state: nextState, schemaRev: 3 } : mould)),
        error: null,
      }))
    } catch {
      set({ error: '纸帘状态更新失败' })
    }
  },
  completeRepair: async (id, input) => {
    const mould = get().moulds.find((item) => item.id === id)
    if (!mould) return { ok: false, error: '未找到对应纸帘' }
    if (!input.repairDate) return { ok: false, error: '请填写修补日期' }
    if (!(input.measuredGap > 0)) return { ok: false, error: '请填写有效的实测间距' }

    const standardGap = mould.stripeGap
    const deviation = calculateDeviation(input.measuredGap, standardGap)
    const passed = !isGapOutOfTolerance(deviation)
    if (!passed && !input.failReason?.trim()) {
      return { ok: false, error: '实测间距超差，请写明留在待修补的原因' }
    }

    const lastRepair: MouldRepair = {
      repairDate: input.repairDate,
      standardGap,
      measuredGap: input.measuredGap,
      deviation,
      passed,
      ...(passed ? {} : { failReason: input.failReason?.trim() }),
    }
    // 合格才转为在用；超差留在待修补状态
    const nextState: MouldStateValue = passed ? '在用' : '待修补'

    try {
      await db.moulds.update(id, { state: nextState, lastRepair: plain(lastRepair), schemaRev: 3 })
      set((state) => ({
        moulds: state.moulds.map((item) =>
          item.id === id ? { ...item, state: nextState, lastRepair, schemaRev: 3 } : item,
        ),
        error: null,
      }))
      return { ok: true, passed }
    } catch {
      set({ error: '修补信息保存失败' })
      return { ok: false, error: '修补信息保存失败' }
    }
  },
}))
