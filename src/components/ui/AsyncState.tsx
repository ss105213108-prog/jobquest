interface LoadingStateProps {
  message: string
}

export function LoadingState({ message }: LoadingStateProps) {
  return <div className="async-state loading-state" role="status"><span className="spinner" /><strong>{message}</strong></div>
}

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="async-state error-state" role="alert">
      <span aria-hidden="true">!</span>
      <div><strong>任務傳令暫時中斷</strong><p>{message}</p></div>
      <button onClick={onRetry}>重新嘗試</button>
    </div>
  )
}
