{ pkgs }: {
  deps = [
    pkgs.nodejs-20_x
    pkgs.nodePackages.typescript
    pkgs.nodePackages.pm2
    pkgs.libuuid
    pkgs.git
  ];
  
  env = {
    LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [pkgs.libuuid];
  };
}
