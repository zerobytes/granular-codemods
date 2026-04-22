function Lines({ lines }) {
  return (
    <div>
      {lines.map((l) => <p>{l}</p>)}
    </div>
  );
}
