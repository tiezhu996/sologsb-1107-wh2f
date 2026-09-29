import { create } from 'zustand'
import type { Mould, MouldInput, MouldRepair, MouldStateValue, RepairCompletionInput } from '../types/mould'
import { db, plain } from '../utils/db'
import { calculateDeviation, isGapOutOfTolerance } from '../utils/stripe'

interface MouldStore {
  moulds: Mould[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadMoulds: () => Promise<void>
  addMould: (input: MouldInput) => Promise<Mould | null>
  markForRepair: (id: number, reason?: string) => Promise<boolean>
  completeRepair: (id: number, input: RepairCompletionInput) => Promise<{ passed: boolean } | null>
}

const SCHEMA_REV = 3

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
      const created: Mould = { ...payload, id, schemaRev: SCHEMA_REV }
      set((state) => ({ moulds: [created, ...state.moulds] }))
      return created
    } catch {
      set({ error: '纸帘登记失败，请检查编号是否重复' })
      return null
    }
  },
  markForRepair: async (id, reason) => {
    try {
      await db.moulds.update(id, { state: '待修补' as MouldStateValue, schemaRev: SCHEMA_REV })
      set((state) => ({
        moulds: state.moulds.map((mould) =>
          mould.id === id ? { ...mould, state: '待修补' as MouldStateValue, schemaRev: SCHEMA_REV } : mould,
        ),
        error: null,
      }))
      return true
    } catch {
      set({ error: '纸帘状态更新失败' })
      return false
    }
  },
  completeRepair: async (id, input) => {
    const mould = get().moulds.find((item) => item.id === id)
    if (!mould) {
      set({ error: '未找到待修补纸帘' })
      return null
    }
    if (!input.repairedAt || input.measuredGap <= 0) {
      set({ error: '请填写修补日期与大于 0 的实测间距' })
      return null
    }
    const deviation = calculateDeviation(input.measuredGap, mould.stripeGap)
    const passed = !isGapOutOfTolerance(deviation)
    const nextState: MouldStateValue = passed ? '在用' : '待修补'
    const reason = input.reason?.trim()
    const lastRepair: MouldRepair = {
      repairedAt: input.repairedAt,
      measuredGap: input.measuredGap,
      deviation,
      passed,
      ...(reason ? { reason } : {}),
    }
    try {
      // 只保留最近一次修补信息：lastRepair 整对象覆盖
      await db.moulds.update(id, { state: nextState, lastRepair: plain(lastRepair), schemaRev: SCHEMA_REV })
      set((state) => ({
        moulds: state.moulds.map((item) =>
          item.id === id ? { ...item, state: nextState, lastRepair, schemaRev: SCHEMA_REV } : item,
        ),
        error: null,
      }))
      return { passed }
    } catch {
      set({ error: '修补信息保存失败' })
      return null
    }
  },
}))
