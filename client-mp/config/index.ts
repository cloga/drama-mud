/* eslint-disable @typescript-eslint/no-var-requires */
const config = {
  projectName: 'drama-mud',
  date: '2026-03-08',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-framework-react'],
  defineConstants: {
    TARO_APP_API_URL: JSON.stringify(process.env.TARO_APP_API_URL || 'http://localhost:3001'),
    TARO_APP_WS_URL: JSON.stringify(process.env.TARO_APP_WS_URL || 'ws://localhost:3001'),
  },
  compiler: {
    type: 'webpack5',
    prebundle: { enable: false },
  },
  framework: 'react',
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    esnextModules: ['taro-ui'],
    devServer: {
      port: 10086,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
        },
      },
    },
    postcss: {
      autoprefixer: { enable: true, config: {} },
    },
  },
}

module.exports = function (merge) {
  if (typeof merge === 'function') {
    return merge({}, config)
  }
  return config
}
