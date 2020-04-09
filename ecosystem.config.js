module.exports = {
  apps : [{
    name: 'API Server',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
  },{
    name: 'Operation Worker',
    script: 'dist/worker.js',
    instances: 1,
    autorestart: true,
    watch: false,
  }],
};
