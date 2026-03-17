import GradualBlur from './components/effects/GradualBlur';

function App() {
  return (
    <GradualBlur
      target="page"
      position="top"
      height="10rem"
      strength={3}
      divCount={8}
      curve="bezier"
      exponential
      opacity={1}
      style={{
        pointerEvents: 'none'
      }}
    />
  );
}

export default App;