import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { GrainStripePreview } from '../components/common/GrainStripePreview'
import { RulerInput } from '../components/common/RulerInput'
import { useMouldFilter } from '../hooks/useMouldFilter'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useMouldStore } from '../stores/mouldStore'
import { useRunStore } from '../stores/runStore'
import type { Mould } from '../types/mould'
import { MOULD_STATES, WIRE_MATERIALS, type MouldInput, type MouldStateValue, type WireMaterial } from '../types/mould'
import { calculateDeviation, calculateMeshDensity, getGapConclusion, isGapOutOfTolerance } from '../utils/stripe'

const emptyMouldForm: MouldInput = {
  mouldNo: '',
  frameW: 60,
  frameH: 90,
  wireMaterial: '竹丝',
  wireDiameter: 0.3,
  stripeGap: 1.1,
  meshDensity: calculateMeshDensity(0.3, 1.1),
  weaver: '周守良',
  state: '在用',
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function MouldLedger() {
  const moulds = useMouldStore((state) => state.moulds)
  const error = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const addMould = useMouldStore((state) => state.addMould)
  const setMouldState = useMouldStore((state) => state.setMouldState)
  const completeRepair = useMouldStore((state) => state.completeRepair)
  const runs = useRunStore((state) => state.sheetRuns)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<MouldInput>(emptyMouldForm)
  const [submitting, setSubmitting] = useState(false)
  const [repairTarget, setRepairTarget] = useState<Mould | null>(null)
  const [repairDate, setRepairDate] = useState(todayIso())
  const [repairGap, setRepairGap] = useState(0)
  const [repairReason, setRepairReason] = useState('')
  const [repairSaving, setRepairSaving] = useState(false)
  const [notice, setNotice] = useState<{ severity: 'success' | 'warning'; text: string } | null>(null)
  const { mmPitchToThreadsPerCm } = useUnitConvert()
  const {
    mouldNo,
    state: stateFilter,
    wireMaterial,
    filteredMoulds,
    setMouldNo,
    setState,
    setWireMaterial,
    resetFilters,
  } = useMouldFilter(moulds)

  useEffect(() => {
    void loadMoulds()
    void loadRuns()
  }, [loadMoulds, loadRuns])

  const calculatedDensity = useMemo(
    () => calculateMeshDensity(form.wireDiameter, form.stripeGap),
    [form.stripeGap, form.wireDiameter],
  )

  const repairDeviation = repairTarget ? calculateDeviation(repairGap, repairTarget.stripeGap) : 0
  const repairExceeded = isGapOutOfTolerance(repairDeviation)
  const repairBlocked = repairExceeded && !repairReason.trim()

  const updateForm = <K extends keyof MouldInput,>(key: K, value: MouldInput[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value }
      next.meshDensity = calculateMeshDensity(next.wireDiameter, next.stripeGap)
      return next
    })
  }

  const handleSubmit = async () => {
    if (!form.mouldNo.trim() || !form.weaver.trim() || form.frameW <= 0 || form.frameH <= 0 || form.wireDiameter <= 0 || form.stripeGap <= 0) return
    setSubmitting(true)
    const created = await addMould({ ...form, mouldNo: form.mouldNo.trim(), weaver: form.weaver.trim(), meshDensity: calculatedDensity })
    setSubmitting(false)
    if (created) {
      setForm(emptyMouldForm)
      setShowForm(false)
    }
  }

  const openRepairDialog = (mould: Mould) => {
    setRepairTarget(mould)
    setRepairDate(todayIso())
    setRepairGap(mould.stripeGap)
    setRepairReason('')
  }

  const handleRepairSubmit = async () => {
    if (!repairTarget?.id) return
    setRepairSaving(true)
    const result = await completeRepair(repairTarget.id, {
      repairDate,
      measuredGap: repairGap,
      failReason: repairReason,
    })
    setRepairSaving(false)
    if (result.ok) {
      const targetNo = repairTarget.mouldNo
      setRepairTarget(null)
      if (result.passed) {
        setNotice({ severity: 'success', text: `${targetNo} 实测间距在 ±0.2 mm 内，已转为在用，可重新投入抄纸。` })
      } else {
        setNotice({ severity: 'warning', text: `${targetNo} 实测间距超差，已留在待修补状态并记录原因。` })
      }
    } else if (result.error) {
      setNotice({ severity: 'warning', text: result.error })
    }
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">纸帘台帐</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>维护帘框尺寸、丝材与帘纹密度；完成修补时填写修补日期与实测间距，合格才重新投入抄纸。</Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => setShowForm((current) => !current)} data-testid="new-mould">
          {showForm ? '收起登记' : '新建纸帘'}
        </Button>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {showForm && (
        <Card data-testid="form-mould" sx={{ borderColor: '#9eb096' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h5">登记新纸帘</Typography>
                <Typography variant="body2" color="text.secondary">丝径或间距变化时，密度会即时重算。</Typography>
              </Box>
              <Chip color="success" label={`${calculatedDensity.toFixed(1)} 根/厘米`} />
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label="纸帘编号" value={form.mouldNo} onChange={(event) => updateForm('mouldNo', event.target.value)} inputProps={{ 'data-testid': 'field-mouldNo' }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField fullWidth type="number" label="帘框宽" value={form.frameW} onChange={(event) => updateForm('frameW', Number(event.target.value))} inputProps={{ min: 1, step: 1, 'data-testid': 'field-frameW' }} InputProps={{ endAdornment: 'cm' }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField fullWidth type="number" label="帘框高" value={form.frameH} onChange={(event) => updateForm('frameH', Number(event.target.value))} inputProps={{ min: 1, step: 1, 'data-testid': 'field-frameH' }} InputProps={{ endAdornment: 'cm' }} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  fullWidth
                  label="帘丝材质"
                  value={form.wireMaterial}
                  onChange={(event) => updateForm('wireMaterial', event.target.value as WireMaterial)}
                  SelectProps={{ native: true, inputProps: { 'data-testid': 'field-wireMaterial' } }}
                >
                  {WIRE_MATERIALS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <RulerInput label="丝径" value={form.wireDiameter} onChange={(value) => updateForm('wireDiameter', value)} min={0.05} max={2} step={0.01} testId="field-wireDiameter" />
              </Grid>
              <Grid item xs={12} md={4}>
                <RulerInput label="帘纹间距" value={form.stripeGap} onChange={(value) => updateForm('stripeGap', value)} min={0.1} max={5} step={0.01} testId="field-stripeGap" />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label="编帘匠人" value={form.weaver} onChange={(event) => updateForm('weaver', event.target.value)} inputProps={{ 'data-testid': 'field-weaver' }} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  fullWidth
                  label="状态"
                  value={form.state}
                  onChange={(event) => updateForm('state', event.target.value as MouldStateValue)}
                  SelectProps={{ native: true, inputProps: { 'data-testid': 'field-state' } }}
                >
                  {MOULD_STATES.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={8} sx={{ display: 'flex', alignItems: 'stretch' }}>
                <Box sx={{ width: '100%' }}>
                  <GrainStripePreview gap={form.stripeGap} wireDiameter={form.wireDiameter} density={calculatedDensity} direction={form.wireMaterial === '马尾丝' ? 'horizontal' : 'vertical'} />
                </Box>
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2.5 }}>
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={submitting} data-testid="submit-mould">
                保存纸帘
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <TextField fullWidth size="small" label="筛选帘号" value={mouldNo} onChange={(event) => setMouldNo(event.target.value)} />
            </Grid>
            <Grid item xs={6} md={2.5}>
              <TextField select fullWidth size="small" label="状态" value={stateFilter} onChange={(event) => setState(event.target.value as MouldStateValue | '全部')} SelectProps={{ native: true }}>
                <option value="全部">全部</option>
                {MOULD_STATES.map((option) => <option key={option} value={option}>{option}</option>)}
              </TextField>
            </Grid>
            <Grid item xs={6} md={2.5}>
              <TextField select fullWidth size="small" label="帘丝材质" value={wireMaterial} onChange={(event) => setWireMaterial(event.target.value as WireMaterial | '全部')} SelectProps={{ native: true }}>
                <option value="全部">全部</option>
                {WIRE_MATERIALS.map((option) => <option key={option} value={option}>{option}</option>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                <Typography variant="body2" color="text.secondary">当前记录</Typography>
                <Typography variant="h5" data-testid="count-mould">{filteredMoulds.length}</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button fullWidth variant="outlined" onClick={resetFilters}>重置筛选</Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <TableContainer component={Card}>
        <Table sx={{ minWidth: 1120 }}>
          <TableHead>
            <TableRow>
              <TableCell>帘号 / 尺寸</TableCell>
              <TableCell>材质与丝径</TableCell>
              <TableCell>间距 / 密度</TableCell>
              <TableCell>编帘匠人</TableCell>
              <TableCell>工序引用</TableCell>
              <TableCell>最近修补</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredMoulds.map((mould) => {
              const relatedRuns = runs.filter((run) => run.mouldId === mould.id)
              const latestRun = relatedRuns[0]
              return (
                <TableRow key={mould.id ?? mould.mouldNo} data-testid="row-mould" hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 750 }}>{mould.mouldNo}</Typography>
                    <Typography variant="caption" color="text.secondary">{mould.frameW} × {mould.frameH} cm · {(mould.frameW * mould.frameH / 10000).toFixed(3)} 平方米</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={mould.wireMaterial} variant="outlined" />
                    <Typography variant="body2" sx={{ mt: 0.6 }}>{mould.wireDiameter.toFixed(2)} mm</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography>{mould.stripeGap.toFixed(2)} mm</Typography>
                    <Typography variant="caption" color="text.secondary">{mould.meshDensity.toFixed(1)} 根/cm · 推算 {mmPitchToThreadsPerCm(mould.wireDiameter + mould.stripeGap).toFixed(1)}</Typography>
                  </TableCell>
                  <TableCell>{mould.weaver}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{relatedRuns.length} 槽工序</Typography>
                    <Typography variant="caption" color="text.secondary">{latestRun ? `最近 ${latestRun.runDate}` : '尚无关联'}</Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 230 }}>
                    {mould.lastRepair ? (
                      <Stack spacing={0.5}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <Chip
                            size="small"
                            color={mould.lastRepair.passed ? 'success' : 'warning'}
                            label={mould.lastRepair.passed ? '合格转在用' : '超差仍待修补'}
                            data-testid={`repair-chip-${mould.id}`}
                          />
                          <Typography variant="caption" color="text.secondary">{mould.lastRepair.repairDate}</Typography>
                        </Box>
                        <Typography variant="caption" display="block">
                          实测 {mould.lastRepair.measuredGap.toFixed(2)} mm · 原 {mould.lastRepair.standardGap.toFixed(2)} mm
                          （{mould.lastRepair.deviation > 0 ? '+' : ''}{mould.lastRepair.deviation.toFixed(2)} mm）
                        </Typography>
                        {!mould.lastRepair.passed && mould.lastRepair.failReason && (
                          <Typography variant="caption" color="warning.dark" display="block" data-testid={`repair-reason-${mould.id}`}>
                            原因：{mould.lastRepair.failReason}
                          </Typography>
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">尚无修补记录</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={mould.state === '在用' ? 'success' : mould.state === '待修补' ? 'warning' : 'default'} label={mould.state} />
                  </TableCell>
                  <TableCell align="right">
                    {mould.state === '待修补' ? (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={mould.id === undefined}
                        onClick={() => openRepairDialog(mould)}
                        data-testid={`complete-repair-${mould.id}`}
                      >
                        完成修补
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={mould.state === '退役' || mould.id === undefined}
                        onClick={() => {
                          if (mould.id !== undefined) void setMouldState(mould.id, '待修补')
                        }}
                      >
                        登记修补
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {filteredMoulds.length === 0 && (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5 }}>没有符合筛选条件的纸帘</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={repairTarget !== null}
        onClose={repairSaving ? undefined : () => setRepairTarget(null)}
        fullWidth
        maxWidth="sm"
        data-testid="repair-dialog"
      >
        {repairTarget && (
          <>
            <DialogTitle>完成修补 · {repairTarget.mouldNo}</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 0.5 }}>
                <Alert severity="info" variant="outlined">
                  原帘纹间距 {repairTarget.stripeGap.toFixed(2)} mm，实测值相差不超过 0.2 mm 才转为在用；超差则留在待修补并写明原因。
                </Alert>
                <TextField
                  fullWidth
                  type="date"
                  label="修补日期"
                  value={repairDate}
                  onChange={(event) => setRepairDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ 'data-testid': 'repair-date' }}
                />
                <RulerInput
                  label="修补后实测间距"
                  value={repairGap}
                  onChange={setRepairGap}
                  min={0.1}
                  max={5}
                  step={0.01}
                  testId="repair-gap"
                  helperText={
                    <Typography component="span" variant="caption" color={repairExceeded ? 'warning.dark' : 'success.dark'}>
                      {repairExceeded ? '超差：' : '合格：'}{getGapConclusion(repairDeviation)}
                      （{repairDeviation > 0 ? '+' : ''}{repairDeviation.toFixed(2)} mm，允许 ±0.2 mm）
                    </Typography>
                  }
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  label="超差原因（超差时必填，合格时可不填）"
                  value={repairReason}
                  onChange={(event) => setRepairReason(event.target.value)}
                  error={repairExceeded && !repairReason.trim()}
                  helperText={repairExceeded && !repairReason.trim() ? '实测间距超差，必须写明留在待修补的原因' : repairTarget.lastRepair?.failReason ? `上次原因：${repairTarget.lastRepair.failReason}` : ' '}
                  inputProps={{ 'data-testid': 'repair-reason-input' }}
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setRepairTarget(null)} disabled={repairSaving}>取消</Button>
              <Button
                variant="contained"
                color={repairExceeded ? 'warning' : 'primary'}
                onClick={handleRepairSubmit}
                disabled={repairSaving || !repairDate || !(repairGap > 0) || repairBlocked}
                data-testid="repair-submit"
              >
                {repairExceeded ? '超差，留在待修补' : '合格，转为在用'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar
        open={notice !== null}
        autoHideDuration={4200}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {notice ? <Alert severity={notice.severity} onClose={() => setNotice(null)} variant="filled" data-testid="repair-notice">{notice.text}</Alert> : <span />}
      </Snackbar>

    </Stack>
  )
}
