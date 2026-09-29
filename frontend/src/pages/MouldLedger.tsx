import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { GrainStripePreview } from '../components/common/GrainStripePreview'
import { RulerInput } from '../components/common/RulerInput'
import { useMouldFilter } from '../hooks/useMouldFilter'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useMouldStore } from '../stores/mouldStore'
import { useRunStore } from '../stores/runStore'
import { MOULD_STATES, WIRE_MATERIALS, type Mould, type MouldInput, type MouldStateValue, type WireMaterial } from '../types/mould'
import { calculateDeviation, calculateMeshDensity, getGapConclusion, isGapOutOfTolerance } from '../utils/stripe'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

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

export default function MouldLedger() {
  const moulds = useMouldStore((state) => state.moulds)
  const error = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const addMould = useMouldStore((state) => state.addMould)
  const markForRepair = useMouldStore((state) => state.markForRepair)
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
  const [repairSubmitting, setRepairSubmitting] = useState(false)
  const [repairFormError, setRepairFormError] = useState('')
  const [notice, setNotice] = useState('')
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
    setRepairFormError('')
  }

  const closeRepairDialog = () => {
    if (repairSubmitting) return
    setRepairTarget(null)
    setRepairFormError('')
  }

  const handleRepairSubmit = async () => {
    if (!repairTarget?.id) return
    if (!repairDate) {
      setRepairFormError('请填写修补日期')
      return
    }
    if (!(repairGap > 0)) {
      setRepairFormError('请填写实测帘纹间距')
      return
    }
    // 超差必须写明原因，纸帘才会继续留在待修补状态
    if (repairExceeded && !repairReason.trim()) {
      setRepairFormError('实测间距超差，请写明留在待修补状态的原因')
      return
    }
    setRepairSubmitting(true)
    const result = await completeRepair(repairTarget.id, {
      repairedAt: repairDate,
      measuredGap: repairGap,
      reason: repairExceeded ? repairReason : repairReason.trim() || undefined,
    })
    setRepairSubmitting(false)
    if (result) {
      setNotice(
        result.passed
          ? `${repairTarget.mouldNo} 实测合格，已转为在用，可重新投入抄纸`
          : `${repairTarget.mouldNo} 实测超差 ${Math.abs(repairDeviation).toFixed(2)} mm，仍留在待修补状态`,
      )
      setRepairTarget(null)
      setRepairFormError('')
    }
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">纸帘台帐</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>维护帘框尺寸、丝材与帘纹密度；修补后实测间距与原间距相差不超过 0.2 mm 方可恢复在用。</Typography>
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
        <Table sx={{ minWidth: 1040 }}>
          <TableHead>
            <TableRow>
              <TableCell>帘号 / 尺寸</TableCell>
              <TableCell>材质与丝径</TableCell>
              <TableCell>间距 / 密度</TableCell>
              <TableCell>编帘匠人</TableCell>
              <TableCell>工序引用</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>最近修补</TableCell>
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
                  <TableCell>
                    <Chip size="small" color={mould.state === '在用' ? 'success' : mould.state === '待修补' ? 'warning' : 'default'} label={mould.state} />
                  </TableCell>
                  <TableCell data-testid={`last-repair-${mould.id ?? mould.mouldNo}`}>
                    {mould.lastRepair ? (
                      <Stack spacing={0.4}>
                        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Chip
                            size="small"
                            color={mould.lastRepair.passed ? 'success' : 'warning'}
                            variant={mould.lastRepair.passed ? 'outlined' : 'filled'}
                            label={mould.lastRepair.passed ? '修补合格' : '修补超差'}
                          />
                          <Typography variant="caption" color="text.secondary">{mould.lastRepair.repairedAt}</Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          实测 {mould.lastRepair.measuredGap.toFixed(2)} mm（原 {mould.stripeGap.toFixed(2)} mm，偏 {mould.lastRepair.deviation > 0 ? '+' : ''}{mould.lastRepair.deviation.toFixed(2)} mm）
                        </Typography>
                        {mould.lastRepair.reason && (
                          <Typography variant="caption" sx={{ color: 'warning.dark', maxWidth: 240 }}>
                            原因：{mould.lastRepair.reason}
                          </Typography>
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">暂无修补记录</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant={mould.state === '待修补' ? 'contained' : 'outlined'}
                      disabled={mould.state === '退役' || mould.id === undefined}
                      onClick={() => {
                        if (mould.id === undefined) return
                        if (mould.state === '待修补') {
                          openRepairDialog(mould)
                        } else {
                          void markForRepair(mould.id)
                        }
                      }}
                      data-testid={mould.state === '待修补' ? `complete-repair-${mould.id}` : `mark-repair-${mould.id}`}
                    >
                      {mould.state === '待修补' ? '完成修补' : '登记修补'}
                    </Button>
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

      <Dialog open={repairTarget !== null} onClose={closeRepairDialog} maxWidth="sm" fullWidth data-testid="repair-dialog">
        <DialogTitle>完成修补 · {repairTarget?.mouldNo}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.25} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              原帘纹间距 {repairTarget?.stripeGap.toFixed(2)} mm；实测值相差不超过 0.2 mm 才转为在用，超差则留在待修补状态。
            </Typography>
            <TextField
              fullWidth
              type="date"
              label="修补日期"
              value={repairDate}
              onChange={(event) => setRepairDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ 'data-testid': 'field-repairDate' }}
            />
            <RulerInput
              label="实测帘纹间距"
              value={repairGap}
              onChange={setRepairGap}
              min={0.1}
              max={5}
              step={0.01}
              testId="field-repairGap"
              helperText={
                <Typography component="span" variant="caption" color={repairExceeded ? 'warning.dark' : 'success.dark'}>
                  {repairExceeded ? '超差：' : '合格：'}{getGapConclusion(repairDeviation)}（{repairDeviation > 0 ? '+' : ''}{repairDeviation.toFixed(2)} mm，允许 ±0.2 mm）
                </Typography>
              }
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="超差原因 / 修补说明"
              value={repairReason}
              onChange={(event) => setRepairReason(event.target.value)}
              placeholder={repairExceeded ? '实测超差，必须写明留在待修补状态的原因' : '合格时可留空'}
              inputProps={{ 'data-testid': 'field-repairReason' }}
              error={repairExceeded && !repairReason.trim()}
              helperText={repairExceeded && !repairReason.trim() ? '超差时原因为必填' : ' '}
            />
            {repairFormError && <Alert severity="warning" data-testid="repair-form-error">{repairFormError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeRepairDialog} disabled={repairSubmitting}>取消</Button>
          <Button variant="contained" onClick={handleRepairSubmit} disabled={repairSubmitting} data-testid="submit-repair">
            {repairSubmitting ? '保存中…' : '提交实测'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(notice)} autoHideDuration={3200} onClose={() => setNotice('')} message={notice} data-testid="repair-notice" />
    </Stack>
  )
}
