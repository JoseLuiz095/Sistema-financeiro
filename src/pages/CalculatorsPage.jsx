import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, m, MotionReveal } from '../components/AppMotion'
import AppIcon from '../components/AppIcon'
import SimulationChart from '../components/calculators/SimulationChart'
import {
  buildCompoundProjection,
  buildFinancingSchedule,
  buildSimpleInterestProjection,
  calculateCashVsInstallments,
  calculateEmergencyReserve,
  calculateFixedIncome,
  calculateIncomeCapital,
  calculateRentVsFinance,
  calculateRetirementPlan,
  calculateSavingsVsCdi,
  calculateTimeToGoal,
  formatGoalTime,
} from '../utils/financialCalculators'
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from '../utils/format'
import './calculators.css'

const CATALOG = [
  {
    id: 'compound',
    title: 'Juros compostos',
    description: 'Projete aportes mensais e o crescimento acumulado do patrimônio.',
    category: 'Investimentos',
    icon: 'interest',
    popular: true,
  },
  {
    id: 'simple',
    title: 'Juros simples',
    description: 'Calcule juros lineares para operações de curto prazo.',
    category: 'Investimentos',
    icon: 'percent',
  },
  {
    id: 'goal',
    title: 'Primeiro milhão e objetivos',
    description: 'Descubra quanto tempo falta para atingir uma meta financeira.',
    category: 'Planejamento',
    icon: 'target',
    popular: true,
  },
  {
    id: 'retirement',
    title: 'Aposentadoria',
    description: 'Estime o patrimônio e o aporte necessário para sua renda futura.',
    category: 'Planejamento',
    icon: 'retirement',
    popular: true,
  },
  {
    id: 'income',
    title: 'Viver de renda',
    description: 'Calcule o capital necessário para uma renda mensal desejada.',
    category: 'Planejamento',
    icon: 'income',
  },
  {
    id: 'emergency',
    title: 'Reserva de emergência',
    description: 'Dimensione sua reserva e o aporte mensal para completá-la.',
    category: 'Planejamento',
    icon: 'reserve',
  },
  {
    id: 'fixed-income',
    title: 'Renda fixa e CDB',
    description: 'Simule rendimento bruto, IOF, IR e valor líquido de resgate.',
    category: 'Investimentos',
    icon: 'bank',
    popular: true,
  },
  {
    id: 'savings-cdi',
    title: 'Poupança x CDI',
    description: 'Compare a poupança com um investimento atrelado ao CDI.',
    category: 'Investimentos',
    icon: 'compare',
  },
  {
    id: 'cash-installments',
    title: 'À vista x parcelado',
    description: 'Compare o desconto à vista com o custo de oportunidade do dinheiro.',
    category: 'Compras e crédito',
    icon: 'card',
  },
  {
    id: 'financing',
    title: 'Financiamento SAC ou Price',
    description: 'Veja parcelas, juros e evolução do saldo devedor.',
    category: 'Compras e crédito',
    icon: 'house',
  },
  {
    id: 'rent-finance',
    title: 'Aluguel x financiamento',
    description: 'Compare patrimônio estimado nos dois cenários ao longo do tempo.',
    category: 'Compras e crédito',
    icon: 'compareHouse',
  },
]

const CATEGORIES = ['Todas', 'Planejamento', 'Investimentos', 'Compras e crédito']

function NumericField({ label, value, onChange, suffix, min = 0, step = 'any', helper }) {
  return (
    <label className="calculator-field">
      <span>{label}</span>
      <div className="calculator-input-wrap">
        <input
          className="personal-private-input"
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <small>{suffix}</small>}
      </div>
      {helper && <em>{helper}</em>}
    </label>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="calculator-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ResultMetric({ label, value, tone = '', helper }) {
  return (
    <article className="calculator-result-metric">
      <span>{label}</span>
      <strong className={`personal-private-value ${tone}`.trim()}>{value}</strong>
      {helper && <small>{helper}</small>}
    </article>
  )
}

function CalculatorShell({ title, description, children, results, chart, note }) {
  return (
    <div className="calculator-workspace-grid">
      <section className="panel calculator-form-panel">
        <div className="panel-header">
          <span className="eyebrow">Simulador</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="calculator-form-grid">{children}</div>
        {note && <div className="calculator-method-note">{note}</div>}
      </section>

      <section className="panel calculator-results-panel">
        <div className="panel-header">
          <span className="eyebrow">Resultado estimado</span>
          <h2>Resumo da simulação</h2>
          <p>Os resultados mudam em tempo real conforme os dados informados.</p>
        </div>
        <div className="calculator-results-grid">{results}</div>
        {chart}
      </section>
    </div>
  )
}

function CompoundCalculator() {
  const [initial, setInitial] = useState('10000')
  const [monthly, setMonthly] = useState('1000')
  const [rate, setRate] = useState('10')
  const [years, setYears] = useState('10')
  const result = useMemo(() => buildCompoundProjection({
    initialAmount: initial,
    monthlyContribution: monthly,
    annualRate: rate,
    years,
  }), [initial, monthly, rate, years])

  return (
    <CalculatorShell
      title="Juros compostos"
      description="Projete a evolução de um investimento com capital inicial e aportes mensais."
      results={(
        <>
          <ResultMetric label="Patrimônio projetado" value={formatCurrency(result.finalAmount)} tone="positive" />
          <ResultMetric label="Total investido" value={formatCurrency(result.investedAmount)} />
          <ResultMetric label="Rendimentos estimados" value={formatCurrency(result.interestAmount)} tone="positive" />
          <ResultMetric label="Taxa mensal equivalente" value={formatPercent(result.monthlyRate)} />
        </>
      )}
      chart={<SimulationChart data={result.points} series={[
        { key: 'balance', label: 'Patrimônio', color: '#1456a0' },
        { key: 'invested', label: 'Valor investido', color: '#69778b' },
      ]} />}
    >
      <NumericField label="Valor inicial" value={initial} onChange={setInitial} suffix="R$" />
      <NumericField label="Aporte mensal" value={monthly} onChange={setMonthly} suffix="R$" />
      <NumericField label="Rentabilidade anual" value={rate} onChange={setRate} suffix="% a.a." />
      <NumericField label="Prazo" value={years} onChange={setYears} suffix="anos" step="1" />
    </CalculatorShell>
  )
}

function SimpleInterestCalculator() {
  const [principal, setPrincipal] = useState('10000')
  const [rate, setRate] = useState('12')
  const [months, setMonths] = useState('12')
  const result = useMemo(() => buildSimpleInterestProjection({ principal, annualRate: rate, months }), [principal, rate, months])

  return (
    <CalculatorShell
      title="Juros simples"
      description="Calcule a remuneração linear sobre o capital inicial, sem juros sobre juros."
      results={(
        <>
          <ResultMetric label="Valor final" value={formatCurrency(result.finalAmount)} />
          <ResultMetric label="Capital inicial" value={formatCurrency(result.investedAmount)} />
          <ResultMetric label="Juros acumulados" value={formatCurrency(result.interestAmount)} tone="positive" />
        </>
      )}
      chart={<SimulationChart data={result.points} series={[
        { key: 'balance', label: 'Saldo', color: '#1456a0' },
        { key: 'invested', label: 'Capital', color: '#69778b' },
      ]} />}
    >
      <NumericField label="Capital inicial" value={principal} onChange={setPrincipal} suffix="R$" />
      <NumericField label="Taxa anual" value={rate} onChange={setRate} suffix="% a.a." />
      <NumericField label="Prazo" value={months} onChange={setMonths} suffix="meses" step="1" />
    </CalculatorShell>
  )
}

function GoalCalculator() {
  const [target, setTarget] = useState('1000000')
  const [initial, setInitial] = useState('20000')
  const [monthly, setMonthly] = useState('2000')
  const [rate, setRate] = useState('10')
  const result = useMemo(() => calculateTimeToGoal({
    targetAmount: target,
    initialAmount: initial,
    monthlyContribution: monthly,
    annualRate: rate,
  }), [target, initial, monthly, rate])

  return (
    <CalculatorShell
      title="Primeiro milhão e objetivos"
      description="Estime o tempo necessário para atingir uma meta mantendo aportes e taxa constantes."
      results={(
        <>
          <ResultMetric label="Tempo estimado" value={formatGoalTime(result.months)} tone={result.reached ? 'positive' : 'negative'} />
          <ResultMetric label="Patrimônio ao atingir" value={formatCurrency(result.finalAmount)} />
          <ResultMetric label="Total aportado" value={formatCurrency(result.investedAmount)} />
          <ResultMetric label="Participação dos rendimentos" value={formatPercent(result.finalAmount > 0 ? ((result.finalAmount - result.investedAmount) / result.finalAmount) * 100 : 0)} />
        </>
      )}
      chart={<SimulationChart data={result.points} series={[
        { key: 'balance', label: 'Patrimônio', color: '#1456a0' },
        { key: 'invested', label: 'Aportes', color: '#69778b' },
      ]} title="Caminho até o objetivo" />}
    >
      <NumericField label="Objetivo financeiro" value={target} onChange={setTarget} suffix="R$" />
      <NumericField label="Valor atual" value={initial} onChange={setInitial} suffix="R$" />
      <NumericField label="Aporte mensal" value={monthly} onChange={setMonthly} suffix="R$" />
      <NumericField label="Rentabilidade anual" value={rate} onChange={setRate} suffix="% a.a." />
    </CalculatorShell>
  )
}

function RetirementCalculator() {
  const [currentAge, setCurrentAge] = useState('30')
  const [retirementAge, setRetirementAge] = useState('60')
  const [income, setIncome] = useState('8000')
  const [retirementYears, setRetirementYears] = useState('25')
  const [realReturn, setRealReturn] = useState('5')
  const [current, setCurrent] = useState('50000')
  const result = useMemo(() => calculateRetirementPlan({
    currentAge,
    retirementAge,
    desiredMonthlyIncome: income,
    retirementYears,
    realAnnualReturn: realReturn,
    currentInvestments: current,
  }), [currentAge, retirementAge, income, retirementYears, realReturn, current])

  return (
    <CalculatorShell
      title="Aposentadoria"
      description="Projete um patrimônio capaz de financiar uma renda mensal por um período definido."
      note="A simulação usa rentabilidade real, já descontada a inflação, e pressupõe retiradas mensais constantes."
      results={(
        <>
          <ResultMetric label="Patrimônio necessário" value={formatCurrency(result.requiredCapital)} />
          <ResultMetric label="Aporte mensal estimado" value={formatCurrency(result.monthlyContribution)} tone="positive" />
          <ResultMetric label="Tempo de acumulação" value={`${formatNumber(result.yearsUntilRetirement, 0)} anos`} />
          <ResultMetric label="Valor atual projetado" value={formatCurrency(result.futureCurrent)} />
        </>
      )}
      chart={<SimulationChart data={result.points} series={[
        { key: 'balance', label: 'Patrimônio', color: '#1456a0' },
        { key: 'invested', label: 'Aportes', color: '#69778b' },
      ]} title="Acumulação até a aposentadoria" />}
    >
      <NumericField label="Idade atual" value={currentAge} onChange={setCurrentAge} suffix="anos" step="1" />
      <NumericField label="Idade para se aposentar" value={retirementAge} onChange={setRetirementAge} suffix="anos" step="1" />
      <NumericField label="Renda mensal desejada" value={income} onChange={setIncome} suffix="R$" />
      <NumericField label="Anos recebendo renda" value={retirementYears} onChange={setRetirementYears} suffix="anos" step="1" />
      <NumericField label="Rentabilidade real anual" value={realReturn} onChange={setRealReturn} suffix="% a.a." />
      <NumericField label="Investimentos atuais" value={current} onChange={setCurrent} suffix="R$" />
    </CalculatorShell>
  )
}

function IncomeCalculator() {
  const [income, setIncome] = useState('5000')
  const [yieldRate, setYieldRate] = useState('6')
  const [capital, setCapital] = useState('100000')
  const result = useMemo(() => calculateIncomeCapital({
    desiredMonthlyIncome: income,
    annualYield: yieldRate,
    currentCapital: capital,
  }), [income, yieldRate, capital])

  return (
    <CalculatorShell
      title="Viver de renda"
      description="Estime o capital necessário para produzir uma renda mensal com uma taxa anual informada."
      note="A taxa deve representar uma retirada sustentável para o seu cenário. A calculadora não considera inflação, impostos ou variação de proventos."
      results={(
        <>
          <ResultMetric label="Capital necessário" value={formatCurrency(result.requiredCapital)} />
          <ResultMetric label="Renda atual estimada" value={formatCurrency(result.currentMonthlyIncome)} />
          <ResultMetric label="Capital ainda necessário" value={formatCurrency(result.gap)} />
          <ResultMetric label="Objetivo coberto" value={formatPercent(result.coveragePercent)} tone={result.coveragePercent >= 100 ? 'positive' : ''} />
        </>
      )}
    >
      <NumericField label="Renda mensal desejada" value={income} onChange={setIncome} suffix="R$" />
      <NumericField label="Rendimento anual utilizável" value={yieldRate} onChange={setYieldRate} suffix="% a.a." />
      <NumericField label="Capital atual" value={capital} onChange={setCapital} suffix="R$" />
    </CalculatorShell>
  )
}

function EmergencyCalculator() {
  const [expenses, setExpenses] = useState('4000')
  const [coverage, setCoverage] = useState('6')
  const [current, setCurrent] = useState('8000')
  const [deadline, setDeadline] = useState('12')
  const result = useMemo(() => calculateEmergencyReserve({
    essentialMonthlyExpenses: expenses,
    coverageMonths: coverage,
    currentReserve: current,
    deadlineMonths: deadline,
  }), [expenses, coverage, current, deadline])

  return (
    <CalculatorShell
      title="Reserva de emergência"
      description="Dimensione uma reserva com base nas despesas essenciais e no período de proteção desejado."
      results={(
        <>
          <ResultMetric label="Reserva recomendada" value={formatCurrency(result.target)} />
          <ResultMetric label="Valor que falta" value={formatCurrency(result.gap)} />
          <ResultMetric label="Aporte mensal" value={formatCurrency(result.monthlyContribution)} tone="positive" />
          <ResultMetric label="Reserva concluída" value={formatPercent(result.completionPercent)} />
        </>
      )}
    >
      <NumericField label="Despesas essenciais mensais" value={expenses} onChange={setExpenses} suffix="R$" />
      <NumericField label="Meses de cobertura" value={coverage} onChange={setCoverage} suffix="meses" step="1" />
      <NumericField label="Reserva atual" value={current} onChange={setCurrent} suffix="R$" />
      <NumericField label="Prazo para completar" value={deadline} onChange={setDeadline} suffix="meses" step="1" />
    </CalculatorShell>
  )
}

function FixedIncomeCalculator() {
  const [principal, setPrincipal] = useState('10000')
  const [cdi, setCdi] = useState('14.9')
  const [percentCdi, setPercentCdi] = useState('100')
  const [days, setDays] = useState('365')
  const [taxExempt, setTaxExempt] = useState('false')
  const result = useMemo(() => calculateFixedIncome({
    principal,
    annualCdi: cdi,
    cdiPercent: percentCdi,
    days,
    taxExempt: taxExempt === 'true',
  }), [principal, cdi, percentCdi, days, taxExempt])

  return (
    <CalculatorShell
      title="Renda fixa e CDB"
      description="Simule um título pós-fixado como percentual do CDI, com tributação estimada no resgate."
      note="A simulação considera capitalização equivalente, tabela regressiva de IR e IOF apenas para resgates antes de 30 dias. Taxas, custos e regras do emissor podem alterar o resultado real."
      results={(
        <>
          <ResultMetric label="Valor líquido" value={formatCurrency(result.netAmount)} tone="positive" />
          <ResultMetric label="Lucro líquido" value={formatCurrency(result.netProfit)} />
          <ResultMetric label="Imposto de renda" value={formatCurrency(result.incomeTax)} helper={`${formatPercent(result.incomeTaxRate)} sobre a base tributável`} />
          <ResultMetric label="IOF estimado" value={formatCurrency(result.iof)} helper={`${formatPercent(result.iofRate)} sobre o rendimento`} />
        </>
      )}
      chart={<SimulationChart data={result.points} series={[
        { key: 'balance', label: 'Saldo bruto', color: '#1456a0' },
        { key: 'invested', label: 'Capital', color: '#69778b' },
      ]} />}
    >
      <NumericField label="Valor investido" value={principal} onChange={setPrincipal} suffix="R$" />
      <NumericField label="CDI anual" value={cdi} onChange={setCdi} suffix="% a.a." />
      <NumericField label="Percentual do CDI" value={percentCdi} onChange={setPercentCdi} suffix="% do CDI" />
      <NumericField label="Prazo" value={days} onChange={setDays} suffix="dias" step="1" />
      <SelectField label="Tributação" value={taxExempt} onChange={setTaxExempt} options={[
        { value: 'false', label: 'Tributado (ex.: CDB)' },
        { value: 'true', label: 'Isento de IR (ex.: LCI/LCA elegível)' },
      ]} />
    </CalculatorShell>
  )
}

function SavingsVsCdiCalculator() {
  const [principal, setPrincipal] = useState('10000')
  const [months, setMonths] = useState('24')
  const [selic, setSelic] = useState('15')
  const [tr, setTr] = useState('1.5')
  const [cdi, setCdi] = useState('14.9')
  const [percentCdi, setPercentCdi] = useState('100')
  const result = useMemo(() => calculateSavingsVsCdi({
    principal,
    months,
    selicAnnual: selic,
    trAnnual: tr,
    cdiAnnual: cdi,
    cdiPercent: percentCdi,
  }), [principal, months, selic, tr, cdi, percentCdi])

  return (
    <CalculatorShell
      title="Poupança x CDI"
      description="Compare o saldo da poupança com uma aplicação tributada atrelada ao CDI."
      note="A TR, a Selic e o CDI devem ser atualizados pelo usuário. A poupança é estimada pela regra legal e o CDI líquido considera IR no fim do prazo."
      results={(
        <>
          <ResultMetric label="Poupança estimada" value={formatCurrency(result.savingsAmount)} />
          <ResultMetric label="CDI líquido estimado" value={formatCurrency(result.cdiNetAmount)} tone={result.difference >= 0 ? 'positive' : ''} />
          <ResultMetric label="Diferença líquida" value={formatCurrency(Math.abs(result.difference))} helper={result.difference >= 0 ? 'Vantagem estimada do CDI' : 'Vantagem estimada da poupança'} />
          <ResultMetric label="IR aplicado ao CDI" value={formatPercent(result.taxRate)} />
        </>
      )}
      chart={<SimulationChart data={result.points} series={[
        { key: 'savings', label: 'Poupança', color: '#69778b' },
        { key: 'cdiNet', label: 'CDI líquido', color: '#1456a0' },
      ]} title="Comparação de saldo" />}
    >
      <NumericField label="Valor inicial" value={principal} onChange={setPrincipal} suffix="R$" />
      <NumericField label="Prazo" value={months} onChange={setMonths} suffix="meses" step="1" />
      <NumericField label="Selic anual" value={selic} onChange={setSelic} suffix="% a.a." />
      <NumericField label="TR anual estimada" value={tr} onChange={setTr} suffix="% a.a." />
      <NumericField label="CDI anual" value={cdi} onChange={setCdi} suffix="% a.a." />
      <NumericField label="Percentual do CDI" value={percentCdi} onChange={setPercentCdi} suffix="% do CDI" />
    </CalculatorShell>
  )
}

function CashInstallmentsCalculator() {
  const [cash, setCash] = useState('9000')
  const [total, setTotal] = useState('10000')
  const [installments, setInstallments] = useState('10')
  const [returnRate, setReturnRate] = useState('12')
  const result = useMemo(() => calculateCashVsInstallments({
    cashPrice: cash,
    installmentTotal: total,
    installments,
    annualReturn: returnRate,
  }), [cash, total, installments, returnRate])

  return (
    <CalculatorShell
      title="À vista x parcelado"
      description="Compare o preço à vista com o valor presente das parcelas considerando a rentabilidade do seu dinheiro."
      results={(
        <>
          <ResultMetric label="Parcela média" value={formatCurrency(result.monthlyPayment)} />
          <ResultMetric label="Valor presente das parcelas" value={formatCurrency(result.presentValue)} />
          <ResultMetric label="Desconto nominal à vista" value={formatPercent(result.impliedDiscount)} />
          <ResultMetric
            label="Cenário mais vantajoso"
            value={result.recommended === 'cash' ? 'Pagamento à vista' : 'Pagamento parcelado'}
            tone="positive"
            helper={`Diferença econômica estimada: ${formatCurrency(Math.abs(result.cashAdvantage))}`}
          />
        </>
      )}
    >
      <NumericField label="Preço à vista" value={cash} onChange={setCash} suffix="R$" />
      <NumericField label="Total parcelado" value={total} onChange={setTotal} suffix="R$" />
      <NumericField label="Número de parcelas" value={installments} onChange={setInstallments} suffix="parcelas" step="1" />
      <NumericField label="Rentabilidade anual do dinheiro" value={returnRate} onChange={setReturnRate} suffix="% a.a." />
    </CalculatorShell>
  )
}

function FinancingCalculator() {
  const [value, setValue] = useState('400000')
  const [down, setDown] = useState('80000')
  const [rate, setRate] = useState('11')
  const [months, setMonths] = useState('360')
  const [system, setSystem] = useState('SAC')
  const result = useMemo(() => buildFinancingSchedule({
    assetValue: value,
    downPayment: down,
    annualRate: rate,
    months,
    system,
  }), [value, down, rate, months, system])

  return (
    <CalculatorShell
      title="Financiamento SAC ou Price"
      description="Simule a evolução das parcelas, juros e saldo devedor em dois sistemas de amortização."
      note="A simulação não inclui seguros, tarifas, impostos, correção monetária ou custo efetivo total da instituição."
      results={(
        <>
          <ResultMetric label="Valor financiado" value={formatCurrency(result.principal)} />
          <ResultMetric label="Primeira parcela" value={formatCurrency(result.firstPayment)} />
          <ResultMetric label="Última parcela" value={formatCurrency(result.lastPayment)} />
          <ResultMetric label="Juros totais" value={formatCurrency(result.totalInterest)} />
          <ResultMetric label="Total desembolsado" value={formatCurrency(result.totalPaid)} />
        </>
      )}
      chart={<SimulationChart data={result.points} series={[
        { key: 'balance', label: 'Saldo devedor', color: '#1456a0' },
        { key: 'payment', label: 'Parcela', color: '#c06b24' },
      ]} title="Evolução do financiamento" />}
    >
      <NumericField label="Valor do bem" value={value} onChange={setValue} suffix="R$" />
      <NumericField label="Entrada" value={down} onChange={setDown} suffix="R$" />
      <NumericField label="Taxa anual" value={rate} onChange={setRate} suffix="% a.a." />
      <NumericField label="Prazo" value={months} onChange={setMonths} suffix="meses" step="1" />
      <SelectField label="Sistema" value={system} onChange={setSystem} options={[
        { value: 'SAC', label: 'SAC — amortização constante' },
        { value: 'PRICE', label: 'Price — parcela constante' },
      ]} />
    </CalculatorShell>
  )
}

function RentFinanceCalculator() {
  const [property, setProperty] = useState('400000')
  const [rent, setRent] = useState('2200')
  const [down, setDown] = useState('80000')
  const [financeRate, setFinanceRate] = useState('11')
  const [years, setYears] = useState('20')
  const [investmentReturn, setInvestmentReturn] = useState('10')
  const [appreciation, setAppreciation] = useState('5')
  const result = useMemo(() => calculateRentVsFinance({
    propertyValue: property,
    rentMonthly: rent,
    downPayment: down,
    annualFinanceRate: financeRate,
    years,
    annualInvestmentReturn: investmentReturn,
    annualPropertyAppreciation: appreciation,
  }), [property, rent, down, financeRate, years, investmentReturn, appreciation])

  const rentingWins = result.difference > 0

  return (
    <CalculatorShell
      title="Aluguel x financiamento"
      description="Compare o patrimônio final estimado ao alugar e investir a diferença ou financiar o imóvel."
      note="Modelo simplificado: não considera ITBI, condomínio, manutenção, seguros, impostos, reajuste específico do aluguel nem custos de compra e venda."
      results={(
        <>
          <ResultMetric label="Patrimônio no cenário aluguel" value={formatCurrency(result.renterWealth)} />
          <ResultMetric label="Patrimônio no cenário financiamento" value={formatCurrency(result.financeWealth)} />
          <ResultMetric label="Cenário estimado mais favorável" value={rentingWins ? 'Alugar e investir' : 'Financiar'} tone="positive" />
          <ResultMetric label="Diferença patrimonial" value={formatCurrency(Math.abs(result.difference))} />
        </>
      )}
      chart={<SimulationChart data={result.points} series={[
        { key: 'rentScenario', label: 'Alugar e investir', color: '#1456a0' },
        { key: 'financeScenario', label: 'Financiar', color: '#16845b' },
      ]} title="Patrimônio estimado por cenário" />}
    >
      <NumericField label="Valor do imóvel" value={property} onChange={setProperty} suffix="R$" />
      <NumericField label="Aluguel mensal" value={rent} onChange={setRent} suffix="R$" />
      <NumericField label="Entrada disponível" value={down} onChange={setDown} suffix="R$" />
      <NumericField label="Juros do financiamento" value={financeRate} onChange={setFinanceRate} suffix="% a.a." />
      <NumericField label="Prazo de comparação" value={years} onChange={setYears} suffix="anos" step="1" />
      <NumericField label="Retorno dos investimentos" value={investmentReturn} onChange={setInvestmentReturn} suffix="% a.a." />
      <NumericField label="Valorização do imóvel" value={appreciation} onChange={setAppreciation} suffix="% a.a." />
    </CalculatorShell>
  )
}

const CALCULATOR_COMPONENTS = {
  compound: CompoundCalculator,
  simple: SimpleInterestCalculator,
  goal: GoalCalculator,
  retirement: RetirementCalculator,
  income: IncomeCalculator,
  emergency: EmergencyCalculator,
  'fixed-income': FixedIncomeCalculator,
  'savings-cdi': SavingsVsCdiCalculator,
  'cash-installments': CashInstallmentsCalculator,
  financing: FinancingCalculator,
  'rent-finance': RentFinanceCalculator,
}

export default function CalculatorsPage() {
  const [selectedId, setSelectedId] = useState('compound')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todas')
  const libraryRef = useRef(null)
  const workspaceRef = useRef(null)

  function scrollToElement(ref) {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        ref.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }, 50)
    })
  }

  function selectCalculator(id) {
    setSelectedId(id)

    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 900px)').matches
    ) {
      scrollToElement(workspaceRef)
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return CATALOG.filter((item) => {
      const matchesCategory = category === 'Todas' || item.category === category
      const matchesSearch = !term || `${item.title} ${item.description} ${item.category}`
        .toLocaleLowerCase('pt-BR')
        .includes(term)
      return matchesCategory && matchesSearch
    })
  }, [search, category])

  const SelectedCalculator = CALCULATOR_COMPONENTS[selectedId] ?? CompoundCalculator
  const selected = CATALOG.find((item) => item.id === selectedId) ?? CATALOG[0]

  return (
    <div className="page-stack calculators-page">
      <MotionReveal>
        <section className="calculators-hero panel-heading-surface">
          <div className="analytics-title-wrap">
            <div className="section-icon" aria-hidden="true">
              <AppIcon name="calculator" size={25} />
            </div>
            <div>
              <span className="eyebrow">Central de simuladores</span>
              <h2>Planeje decisões financeiras antes de executar</h2>
              <p>
                Compare cenários de investimento, metas, renda, crédito e compra de imóvel com gráficos interativos e resultados instantâneos.
              </p>
            </div>
          </div>

          <div className="calculator-hero-stats" aria-label="Resumo das calculadoras">
            <div><strong>{CATALOG.length}</strong><span>simuladores</span></div>
            <div><strong>3</strong><span>categorias</span></div>
            <div><strong>100%</strong><span>local e privado</span></div>
          </div>
        </section>
      </MotionReveal>

      <MotionReveal delay={0.04}>
        <section ref={libraryRef} className="panel calculator-library-panel">
          <div className="calculator-toolbar">
            <label className="calculator-search">
              <AppIcon name="search" size={18} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar calculadora por nome ou objetivo..."
              />
            </label>

            <div className="calculator-category-tabs" role="group" aria-label="Categorias de calculadoras">
              {CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={category === item ? 'active' : ''}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="calculator-card-grid">
            {filtered.map((item, index) => (
              <m.button
                key={item.id}
                type="button"
                className={`calculator-card ${selectedId === item.id ? 'active' : ''}`}
                onClick={() => selectCalculator(item.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.025, 0.18) }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.99 }}
              >
                <span className="calculator-card-icon"><AppIcon name={item.icon} size={22} /></span>
                <span className="calculator-card-copy">
                  <span className="calculator-card-title-row">
                    <strong>{item.title}</strong>
                    {item.popular && <small>Popular</small>}
                  </span>
                  <span>{item.description}</span>
                  <em>{item.category}</em>
                </span>
                <AppIcon name="arrow" size={18} />
              </m.button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="calculator-empty-state">
              <AppIcon name="search" size={24} />
              <strong>Nenhuma calculadora encontrada</strong>
              <span>Altere a busca ou escolha outra categoria.</span>
            </div>
          )}
        </section>
      </MotionReveal>

      <div
        ref={workspaceRef}
        className="calculator-workspace-anchor"
      >
        <div className="calculator-mobile-context">
          <div>
            <span>Simulador selecionado</span>
            <strong>{selected.title}</strong>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => scrollToElement(libraryRef)}
          >
            Trocar
          </button>
        </div>

        <AnimatePresence mode="wait">
          <m.div
            key={selected.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <SelectedCalculator />
          </m.div>
        </AnimatePresence>
      </div>

      <section className="calculator-disclaimer">
        <AppIcon name="shield" size={19} />
        <p>
          As calculadoras fornecem estimativas educacionais. Taxas, tributos, inflação, custos e condições contratuais podem mudar; confirme decisões relevantes com documentos oficiais e profissionais habilitados.
        </p>
      </section>
    </div>
  )
}
