import { useState } from 'react'
import { createCategory } from '../services/financeService'

export default function CategoriesPage({ user, categories, onChanged, setFeedback }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('EXPENSE')

  async function submit(event) {
    event.preventDefault()
    try {
      await createCategory({ user_id: user.id, name: name.trim(), category_type: type, active: true })
      setName('')
      setFeedback({ type: 'success', message: 'Categoria cadastrada.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  return (
    <div className="content-grid">
      <section className="panel">
        <div className="panel-header"><h2>Nova categoria</h2></div>
        <form className="form" onSubmit={submit}>
          <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}><option value="INCOME">Receita</option><option value="EXPENSE">Despesa</option><option value="BOTH">Ambos</option></select></label>
          <button className="primary-button">Cadastrar</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Categorias</h2></div>
        <div className="tag-list">{categories.map((category) => <span key={category.id} className={`tag ${category.category_type.toLowerCase()}`}>{category.name}</span>)}</div>
      </section>
    </div>
  )
}
