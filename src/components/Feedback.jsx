export default function Feedback({ feedback }) {
  if (!feedback?.message) return null
  return <div className={`feedback ${feedback.type || 'info'}`}>{feedback.message}</div>
}
