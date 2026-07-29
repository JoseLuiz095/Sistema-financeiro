const MONTHS_PER_YEAR = 12
const DAYS_PER_YEAR = 365

export function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function annualToMonthlyRate(annualRatePercent) {
  const annualRate = toNumber(annualRatePercent) / 100
  if (annualRate <= -1) return -1
  return Math.pow(1 + annualRate, 1 / MONTHS_PER_YEAR) - 1
}

export function buildCompoundProjection({
  initialAmount,
  monthlyContribution,
  annualRate,
  years,
}) {
  const initial = Math.max(0, toNumber(initialAmount))
  const contribution = Math.max(0, toNumber(monthlyContribution))
  const totalMonths = Math.max(1, Math.round(toNumber(years, 1) * 12))
  const monthlyRate = annualToMonthlyRate(annualRate)
  let balance = initial
  let invested = initial
  const points = [{ period: 'Hoje', balance, invested }]

  for (let month = 1; month <= totalMonths; month += 1) {
    balance = balance * (1 + monthlyRate) + contribution
    invested += contribution

    if (month % 12 === 0 || month === totalMonths) {
      const year = month / 12
      points.push({
        period: Number.isInteger(year)
          ? `${year} ano${year === 1 ? '' : 's'}`
          : `${month} meses`,
        balance,
        invested,
      })
    }
  }

  return {
    finalAmount: balance,
    investedAmount: invested,
    interestAmount: balance - invested,
    monthlyRate: monthlyRate * 100,
    points,
  }
}

export function buildSimpleInterestProjection({
  principal,
  annualRate,
  months,
}) {
  const amount = Math.max(0, toNumber(principal))
  const totalMonths = Math.max(1, Math.round(toNumber(months, 1)))
  const monthlyRate = toNumber(annualRate) / 100 / 12
  const interest = amount * monthlyRate * totalMonths
  const points = []

  for (let month = 0; month <= totalMonths; month += 1) {
    if (month === 0 || month % 3 === 0 || month === totalMonths) {
      points.push({
        period: month === 0 ? 'Hoje' : `${month} meses`,
        balance: amount + amount * monthlyRate * month,
        invested: amount,
      })
    }
  }

  return {
    finalAmount: amount + interest,
    investedAmount: amount,
    interestAmount: interest,
    points,
  }
}

export function calculateTimeToGoal({
  targetAmount,
  initialAmount,
  monthlyContribution,
  annualRate,
  maxYears = 80,
}) {
  const target = Math.max(0, toNumber(targetAmount))
  const initial = Math.max(0, toNumber(initialAmount))
  const contribution = Math.max(0, toNumber(monthlyContribution))
  const monthlyRate = annualToMonthlyRate(annualRate)
  const maxMonths = Math.max(12, Math.round(maxYears * 12))
  let balance = initial
  let invested = initial
  const points = [{ period: 'Hoje', balance, invested }]

  if (balance >= target) {
    return {
      reached: true,
      months: 0,
      finalAmount: balance,
      investedAmount: invested,
      points,
    }
  }

  if (contribution <= 0 && monthlyRate <= 0) {
    return {
      reached: false,
      months: null,
      finalAmount: balance,
      investedAmount: invested,
      points,
    }
  }

  for (let month = 1; month <= maxMonths; month += 1) {
    balance = balance * (1 + monthlyRate) + contribution
    invested += contribution

    if (month % 12 === 0 || balance >= target) {
      points.push({
        period: balance >= target
          ? `${month} meses`
          : `${month / 12} ano${month === 12 ? '' : 's'}`,
        balance,
        invested,
      })
    }

    if (balance >= target) {
      return {
        reached: true,
        months: month,
        finalAmount: balance,
        investedAmount: invested,
        points,
      }
    }
  }

  return {
    reached: false,
    months: null,
    finalAmount: balance,
    investedAmount: invested,
    points,
  }
}

export function calculateRetirementPlan({
  currentAge,
  retirementAge,
  desiredMonthlyIncome,
  retirementYears,
  realAnnualReturn,
  currentInvestments,
}) {
  const age = Math.max(0, toNumber(currentAge))
  const targetAge = Math.max(age + 1, toNumber(retirementAge, age + 1))
  const yearsUntilRetirement = targetAge - age
  const income = Math.max(0, toNumber(desiredMonthlyIncome))
  const withdrawalMonths = Math.max(12, Math.round(toNumber(retirementYears, 20) * 12))
  const monthlyRealRate = annualToMonthlyRate(realAnnualReturn)

  let requiredCapital
  if (Math.abs(monthlyRealRate) < 0.0000001) {
    requiredCapital = income * withdrawalMonths
  } else {
    requiredCapital = income * (
      1 - Math.pow(1 + monthlyRealRate, -withdrawalMonths)
    ) / monthlyRealRate
  }

  const current = Math.max(0, toNumber(currentInvestments))
  const accumulationMonths = Math.max(1, Math.round(yearsUntilRetirement * 12))
  const futureCurrent = current * Math.pow(1 + monthlyRealRate, accumulationMonths)
  const gap = Math.max(0, requiredCapital - futureCurrent)
  const factor = Math.abs(monthlyRealRate) < 0.0000001
    ? accumulationMonths
    : (Math.pow(1 + monthlyRealRate, accumulationMonths) - 1) / monthlyRealRate
  const monthlyContribution = factor > 0 ? gap / factor : gap

  const projection = buildCompoundProjection({
    initialAmount: current,
    monthlyContribution,
    annualRate: realAnnualReturn,
    years: yearsUntilRetirement,
  })

  return {
    yearsUntilRetirement,
    requiredCapital,
    futureCurrent,
    monthlyContribution,
    points: projection.points,
  }
}

export function calculateEmergencyReserve({
  essentialMonthlyExpenses,
  coverageMonths,
  currentReserve,
  deadlineMonths,
}) {
  const expenses = Math.max(0, toNumber(essentialMonthlyExpenses))
  const months = Math.max(1, Math.round(toNumber(coverageMonths, 6)))
  const current = Math.max(0, toNumber(currentReserve))
  const deadline = Math.max(1, Math.round(toNumber(deadlineMonths, 12)))
  const target = expenses * months
  const gap = Math.max(0, target - current)

  return {
    target,
    gap,
    monthlyContribution: gap / deadline,
    completionPercent: target > 0 ? Math.min(100, (current / target) * 100) : 100,
  }
}

export function getFixedIncomeTaxRate(days) {
  const term = Math.max(1, Math.round(toNumber(days, 1)))
  if (term <= 180) return 22.5
  if (term <= 360) return 20
  if (term <= 720) return 17.5
  return 15
}

const IOF_RATES = [
  96, 93, 90, 86, 83, 80, 76, 73, 70, 66,
  63, 60, 56, 53, 50, 46, 43, 40, 36, 33,
  30, 26, 23, 20, 16, 13, 10, 6, 3,
]

export function getIofRate(days) {
  const term = Math.max(1, Math.round(toNumber(days, 1)))
  if (term >= 30) return 0
  return IOF_RATES[term - 1] ?? 0
}

export function calculateFixedIncome({
  principal,
  annualCdi,
  cdiPercent,
  days,
  taxExempt = false,
}) {
  const amount = Math.max(0, toNumber(principal))
  const term = Math.max(1, Math.round(toNumber(days, 1)))
  const annualRate = (toNumber(annualCdi) * toNumber(cdiPercent, 100)) / 100
  const grossAmount = amount * Math.pow(1 + annualRate / 100, term / DAYS_PER_YEAR)
  const grossProfit = Math.max(0, grossAmount - amount)
  const iofRate = taxExempt ? 0 : getIofRate(term)
  const iof = grossProfit * (iofRate / 100)
  const incomeTaxRate = taxExempt ? 0 : getFixedIncomeTaxRate(term)
  const incomeTax = Math.max(0, grossProfit - iof) * (incomeTaxRate / 100)
  const netAmount = grossAmount - iof - incomeTax

  const points = []
  const pointCount = Math.min(12, Math.max(3, Math.ceil(term / 30)))
  for (let index = 0; index <= pointCount; index += 1) {
    const currentDays = Math.round((term * index) / pointCount)
    const currentGross = amount * Math.pow(
      1 + annualRate / 100,
      currentDays / DAYS_PER_YEAR,
    )
    points.push({
      period: currentDays === 0 ? 'Hoje' : `${currentDays} dias`,
      balance: currentGross,
      invested: amount,
    })
  }

  return {
    annualRate,
    grossAmount,
    grossProfit,
    iofRate,
    iof,
    incomeTaxRate,
    incomeTax,
    netAmount,
    netProfit: netAmount - amount,
    points,
  }
}

export function calculateSavingsVsCdi({
  principal,
  months,
  selicAnnual,
  trAnnual,
  cdiAnnual,
  cdiPercent,
}) {
  const amount = Math.max(0, toNumber(principal))
  const totalMonths = Math.max(1, Math.round(toNumber(months, 12)))
  const selic = toNumber(selicAnnual)
  const tr = toNumber(trAnnual)
  const savingsBaseAnnual = selic > 8.5
    ? (Math.pow(1.005, 12) - 1) * 100
    : selic * 0.7
  const savingsAnnual = ((1 + savingsBaseAnnual / 100) * (1 + tr / 100) - 1) * 100
  const cdiProductAnnual = (toNumber(cdiAnnual) * toNumber(cdiPercent, 100)) / 100
  const savingsMonthly = annualToMonthlyRate(savingsAnnual)
  const cdiMonthly = annualToMonthlyRate(cdiProductAnnual)
  const points = []

  for (let month = 0; month <= totalMonths; month += 1) {
    if (month === 0 || month % Math.max(1, Math.round(totalMonths / 12)) === 0 || month === totalMonths) {
      points.push({
        period: month === 0 ? 'Hoje' : `${month} meses`,
        savings: amount * Math.pow(1 + savingsMonthly, month),
        cdiGross: amount * Math.pow(1 + cdiMonthly, month),
      })
    }
  }

  const savingsAmount = amount * Math.pow(1 + savingsMonthly, totalMonths)
  const cdiGrossAmount = amount * Math.pow(1 + cdiMonthly, totalMonths)
  const days = Math.round(totalMonths * 30.4375)
  const taxRate = getFixedIncomeTaxRate(days)
  const cdiProfit = Math.max(0, cdiGrossAmount - amount)
  const cdiNetAmount = cdiGrossAmount - cdiProfit * (taxRate / 100)

  return {
    savingsAnnual,
    cdiProductAnnual,
    savingsAmount,
    cdiGrossAmount,
    cdiNetAmount,
    taxRate,
    difference: cdiNetAmount - savingsAmount,
    points: points.map((point) => ({
      ...point,
      cdiNet: amount + Math.max(0, point.cdiGross - amount) * (1 - taxRate / 100),
    })),
  }
}

export function calculateCashVsInstallments({
  cashPrice,
  installmentTotal,
  installments,
  annualReturn,
}) {
  const cash = Math.max(0, toNumber(cashPrice))
  const total = Math.max(0, toNumber(installmentTotal))
  const count = Math.max(1, Math.round(toNumber(installments, 1)))
  const monthlyPayment = total / count
  const monthlyRate = annualToMonthlyRate(annualReturn)
  let presentValue = 0

  for (let month = 1; month <= count; month += 1) {
    presentValue += monthlyPayment / Math.pow(1 + monthlyRate, month)
  }

  const cashAdvantage = presentValue - cash
  return {
    monthlyPayment,
    presentValue,
    cashAdvantage,
    recommended: cashAdvantage > 0 ? 'cash' : 'installments',
    impliedDiscount: total > 0 ? ((total - cash) / total) * 100 : 0,
  }
}

export function buildFinancingSchedule({
  assetValue,
  downPayment,
  annualRate,
  months,
  system,
}) {
  const value = Math.max(0, toNumber(assetValue))
  const down = Math.min(value, Math.max(0, toNumber(downPayment)))
  const principal = Math.max(0, value - down)
  const totalMonths = Math.max(1, Math.round(toNumber(months, 12)))
  const monthlyRate = annualToMonthlyRate(annualRate)
  const normalizedSystem = system === 'SAC' ? 'SAC' : 'PRICE'
  const schedule = []
  let balance = principal
  let totalInterest = 0
  let totalPaid = down
  let pricePayment = 0

  if (normalizedSystem === 'PRICE') {
    pricePayment = Math.abs(monthlyRate) < 0.0000001
      ? principal / totalMonths
      : principal * (
          monthlyRate * Math.pow(1 + monthlyRate, totalMonths)
        ) / (
          Math.pow(1 + monthlyRate, totalMonths) - 1
        )
  }

  const sacAmortization = principal / totalMonths

  for (let month = 1; month <= totalMonths; month += 1) {
    const interest = balance * monthlyRate
    const amortization = normalizedSystem === 'SAC'
      ? sacAmortization
      : Math.max(0, pricePayment - interest)
    const payment = normalizedSystem === 'SAC'
      ? amortization + interest
      : pricePayment
    balance = Math.max(0, balance - amortization)
    totalInterest += interest
    totalPaid += payment

    schedule.push({
      month,
      period: `${month}ª`,
      payment,
      interest,
      amortization,
      balance,
    })
  }

  const chartStep = Math.max(1, Math.ceil(totalMonths / 24))
  const points = schedule
    .filter((item, index) => index === 0 || index === schedule.length - 1 || index % chartStep === 0)
    .map((item) => ({
      period: item.period,
      balance: item.balance,
      payment: item.payment,
    }))

  return {
    principal,
    firstPayment: schedule[0]?.payment ?? 0,
    lastPayment: schedule.at(-1)?.payment ?? 0,
    totalInterest,
    totalPaid,
    schedule,
    points,
  }
}

export function calculateIncomeCapital({
  desiredMonthlyIncome,
  annualYield,
  currentCapital,
}) {
  const income = Math.max(0, toNumber(desiredMonthlyIncome))
  const yieldRate = Math.max(0.01, toNumber(annualYield, 6)) / 100
  const current = Math.max(0, toNumber(currentCapital))
  const requiredCapital = income * 12 / yieldRate
  const currentMonthlyIncome = current * yieldRate / 12

  return {
    requiredCapital,
    currentMonthlyIncome,
    gap: Math.max(0, requiredCapital - current),
    coveragePercent: requiredCapital > 0
      ? Math.min(100, (current / requiredCapital) * 100)
      : 100,
  }
}

export function calculateRentVsFinance({
  propertyValue,
  rentMonthly,
  downPayment,
  annualFinanceRate,
  years,
  annualInvestmentReturn,
  annualPropertyAppreciation,
}) {
  const value = Math.max(0, toNumber(propertyValue))
  const rent = Math.max(0, toNumber(rentMonthly))
  const down = Math.min(value, Math.max(0, toNumber(downPayment)))
  const totalMonths = Math.max(12, Math.round(toNumber(years, 20) * 12))
  const financing = buildFinancingSchedule({
    assetValue: value,
    downPayment: down,
    annualRate: annualFinanceRate,
    months: totalMonths,
    system: 'PRICE',
  })
  const investmentMonthly = annualToMonthlyRate(annualInvestmentReturn)
  const propertyMonthly = annualToMonthlyRate(annualPropertyAppreciation)
  let renterWealth = down
  let totalRentPaid = 0
  let currentRent = rent
  const points = [{ period: 'Hoje', rentScenario: renterWealth, financeScenario: down }]

  for (let month = 1; month <= totalMonths; month += 1) {
    const payment = financing.schedule[month - 1]?.payment ?? 0
    const difference = Math.max(0, payment - currentRent)
    renterWealth = renterWealth * (1 + investmentMonthly) + difference
    totalRentPaid += currentRent
    currentRent *= 1 + propertyMonthly

    if (month % 12 === 0 || month === totalMonths) {
      const propertyMarketValue = value * Math.pow(1 + propertyMonthly, month)
      const remainingDebt = financing.schedule[month - 1]?.balance ?? 0
      points.push({
        period: `${Math.ceil(month / 12)} ano${month <= 12 ? '' : 's'}`,
        rentScenario: renterWealth,
        financeScenario: propertyMarketValue - remainingDebt,
      })
    }
  }

  const finalPropertyValue = value * Math.pow(1 + propertyMonthly, totalMonths)
  const finalFinanceWealth = finalPropertyValue

  return {
    renterWealth,
    financeWealth: finalFinanceWealth,
    totalRentPaid,
    totalFinancePaid: financing.totalPaid,
    difference: renterWealth - finalFinanceWealth,
    points,
  }
}

export function formatGoalTime(months) {
  if (months == null) return 'Não atingido no horizonte simulado'
  if (months === 0) return 'Objetivo já atingido'
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  const parts = []
  if (years > 0) parts.push(`${years} ano${years === 1 ? '' : 's'}`)
  if (remainingMonths > 0) parts.push(`${remainingMonths} mês${remainingMonths === 1 ? '' : 'es'}`)
  return parts.join(' e ')
}
