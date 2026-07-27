export const ACCOUNT_TYPES = [
  { value: 'CHECKING', label: 'Conta corrente' },
  { value: 'SAVINGS', label: 'Conta poupança' },
  { value: 'DIGITAL_WALLET', label: 'Carteira digital' },
  { value: 'BROKERAGE', label: 'Corretora' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'OTHER', label: 'Outra' },
]

export const TRANSACTION_TYPES = [
  { value: 'INCOME', label: 'Receita', direction: 1, categoryType: 'INCOME' },
  { value: 'EXPENSE', label: 'Despesa', direction: -1, categoryType: 'EXPENSE' },
  { value: 'OWN_TRANSFER_IN', label: 'Transferência própria recebida', direction: 1, categoryType: null },
  { value: 'OWN_TRANSFER_OUT', label: 'Transferência própria enviada', direction: -1, categoryType: null },
  { value: 'INVESTMENT_CONTRIBUTION', label: 'Aporte em investimento', direction: -1, categoryType: null },
  { value: 'INVESTMENT_REDEMPTION', label: 'Resgate de investimento', direction: 1, categoryType: null },
  { value: 'DIVIDEND', label: 'Dividendo', direction: 1, categoryType: 'INCOME' },
  { value: 'INTEREST_ON_EQUITY', label: 'Juros sobre capital próprio', direction: 1, categoryType: 'INCOME' },
  { value: 'FII_INCOME', label: 'Rendimento de FII', direction: 1, categoryType: 'INCOME' },
  { value: 'REFUND', label: 'Reembolso', direction: 1, categoryType: 'INCOME' },
  { value: 'REVERSAL', label: 'Estorno', direction: 1, categoryType: null },
  { value: 'ADJUSTMENT', label: 'Ajuste', direction: 1, categoryType: null },
]

export const DEFAULT_CATEGORIES = [
  { name: 'Salário', category_type: 'INCOME' },
  { name: 'Renda extra', category_type: 'INCOME' },
  { name: 'Reembolso', category_type: 'INCOME' },
  { name: 'Dividendos e proventos', category_type: 'INCOME' },
  { name: 'Rendimentos financeiros', category_type: 'INCOME' },
  { name: 'Alimentação', category_type: 'EXPENSE' },
  { name: 'Moradia', category_type: 'EXPENSE' },
  { name: 'Transporte', category_type: 'EXPENSE' },
  { name: 'Saúde', category_type: 'EXPENSE' },
  { name: 'Educação', category_type: 'EXPENSE' },
  { name: 'Lazer', category_type: 'EXPENSE' },
  { name: 'Assinaturas', category_type: 'EXPENSE' },
  { name: 'Impostos e taxas', category_type: 'EXPENSE' },
  { name: 'Compras', category_type: 'EXPENSE' },
  { name: 'Investimentos', category_type: 'EXPENSE' },
  { name: 'Outras despesas', category_type: 'EXPENSE' },
]

export const ASSET_TYPES = [
  { value: 'STOCK', label: 'Ação' },
  { value: 'FII', label: 'FII' },
  { value: 'ETF', label: 'ETF' },
  { value: 'BDR', label: 'BDR' },
  { value: 'FIXED_INCOME', label: 'Renda fixa' },
  { value: 'TREASURY', label: 'Tesouro Direto' },
  { value: 'FUND', label: 'Fundo' },
  { value: 'CRYPTO', label: 'Criptomoeda' },
  { value: 'OTHER', label: 'Outro' },
]

export const OPERATION_TYPES = [
  { value: 'BUY', label: 'Compra' },
  { value: 'SELL', label: 'Venda' },
  { value: 'TRANSFER_IN', label: 'Transferência de entrada' },
  { value: 'TRANSFER_OUT', label: 'Transferência de saída' },
  { value: 'BONUS', label: 'Bonificação' },
]

export const TRADE_TYPES = [
  { value: 'NORMAL', label: 'Operação comum' },
  { value: 'DAY_TRADE', label: 'Day trade' },
]

export const INCOME_TYPES = [
  { value: 'DIVIDEND', label: 'Dividendo' },
  { value: 'INTEREST_ON_EQUITY', label: 'JCP' },
  { value: 'FII_INCOME', label: 'Rendimento de FII' },
  { value: 'RENTAL', label: 'Aluguel de ativos' },
  { value: 'AMORTIZATION', label: 'Amortização' },
  { value: 'OTHER', label: 'Outro provento' },
]

export function findLabel(items, value) {
  return items.find((item) => item.value === value)?.label ?? value
}

export const getAccountTypeLabel = (value) => findLabel(ACCOUNT_TYPES, value)
export const getTransactionTypeLabel = (value) => findLabel(TRANSACTION_TYPES, value)
export const getAssetTypeLabel = (value) => findLabel(ASSET_TYPES, value)
export const getOperationTypeLabel = (value) => findLabel(OPERATION_TYPES, value)
export const getIncomeTypeLabel = (value) => findLabel(INCOME_TYPES, value)
export const getTransactionType = (value) => TRANSACTION_TYPES.find((item) => item.value === value) ?? null

export const RECURRENCE_TYPES = [
  { value: 'ONCE', label: 'Uma vez' },
  { value: 'DAILY', label: 'Diário' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'YEARLY', label: 'Anual' },
]

export const OCCURRENCE_STATUSES = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'PAID', label: 'Realizado' },
  { value: 'OVERDUE', label: 'Atrasado' },
  { value: 'SKIPPED', label: 'Ignorado' },
  { value: 'CANCELLED', label: 'Cancelado' },
]

export const CONNECTION_STATUSES = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'ACTIVE', label: 'Ativa' },
  { value: 'ERROR', label: 'Com erro' },
  { value: 'EXPIRED', label: 'Consentimento expirado' },
  { value: 'DISABLED', label: 'Desativada' },
]

export const getRecurrenceTypeLabel = (value) => findLabel(RECURRENCE_TYPES, value)
export const getOccurrenceStatusLabel = (value) => findLabel(OCCURRENCE_STATUSES, value)
export const getConnectionStatusLabel = (value) => findLabel(CONNECTION_STATUSES, value)
