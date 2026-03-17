import GradualBlur from "../components/effects/GradualBlur";

function Home() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      <GradualBlur
        target="page"
        position="top"
        height="5rem"
        strength={3}
        divCount={8}
        curve="bezier"
        exponential
        opacity={1}
      />
    </div>
  );
}

export default Home;