import React from 'react';
import { attemptStaleBundleRecovery } from '../utils/recovery.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, recovering: false };
  }

  static getDerivedStateFromError(error) {
    // Old-bundle mismatch? Self-heal (clear caches + hard reload once).
    const recovering = attemptStaleBundleRecovery(error);
    return { hasError: true, error, recovering };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.state.recovering) {
        return (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
            <i className="ti ti-loader-2 spin" style={{ fontSize: '40px', color: 'var(--teal)', marginBottom: '16px' }}></i>
            <p style={{ color: 'var(--t2)', maxWidth: '400px' }}>กำลังอัปเดตเป็นเวอร์ชันล่าสุด กรุณารอสักครู่...</p>
          </div>
        );
      }
      // You can render any custom fallback UI
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: 'var(--bg)',
          color: 'var(--text)'
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: '48px', color: '#d84f4f', marginBottom: '16px' }}></i>
          <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>ขออภัย เกิดข้อผิดพลาดบางอย่าง</h1>
          <p style={{ color: 'var(--t2)', marginBottom: '24px', maxWidth: '400px' }}>
            แอปพลิเคชันพบปัญหาในการแสดงผลหน้านี้ กรุณาลองรีเฟรชหน้าเว็บอีกครั้ง
          </p>
          <button 
            className="btn btn-teal"
            onClick={() => window.location.reload()}
          >
            <i className="ti ti-refresh" style={{ marginRight: '8px' }}></i>
            รีเฟรชหน้าเว็บ
          </button>
          
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '32px', textAlign: 'left', background: 'var(--bg2)', padding: '16px', borderRadius: '8px', maxWidth: '800px', overflow: 'auto' }}>
              <summary style={{ cursor: 'pointer', color: '#d84f4f', fontWeight: 'bold' }}>Error Details (Dev Only)</summary>
              <pre style={{ marginTop: '12px', fontSize: '12px', color: '#d84f4f' }}>
                {this.state.error && this.state.error.toString()}
                <br />
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
