function Mount() {
  // TODO[granular-codemod]: useEffect with empty deps. In Granular this runs once at construction; if you need a mount-time hook, attach to the parent renderable lifecycle.
  (() => {
    init();
  })();
  return <div />;
}
