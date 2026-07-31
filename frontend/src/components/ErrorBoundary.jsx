import React from 'react';
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{color: 'red', padding: '20px', backgroundColor: '#fee', borderRadius: '8px', margin: '20px'}}>
          <h2>Ocurrió un error al cargar el componente.</h2>
          <pre style={{whiteSpace: 'pre-wrap'}}>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
