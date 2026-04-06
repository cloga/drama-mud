import Taro from '@tarojs/taro'

function getRawErrorMessage(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

function isLocalEndpoint(endpoint) {
  return /localhost|127\.0\.0\.1/i.test(endpoint)
}

function getRuntimeLabel() {
  const env = Taro.getEnv()
  if (env === Taro.ENV_TYPE.WEAPP) return '微信小程序'
  if (env === Taro.ENV_TYPE.WEB) return 'H5'
  return env
}

function buildEndpointHint(kind, endpoint) {
  if (!endpoint) {
    return `${kind} 地址未配置，请设置对应的 TARO_APP_${kind === 'API' ? 'API' : 'WS'}_URL 环境变量。`
  }

  if (isLocalEndpoint(endpoint) && Taro.getEnv() !== Taro.ENV_TYPE.WEB) {
    return `当前 ${getRuntimeLabel()} 仍在使用本地开发地址 ${endpoint}；真机或正式环境请改成可访问的 ${kind === 'API' ? 'https' : 'wss'} 域名。`
  }

  return `请检查 ${kind} 地址 ${endpoint} 是否可访问，以及对应域名是否已在平台后台放行。`
}

export function formatApiError(endpoint, error) {
  const message = getRawErrorMessage(error)
  return new Error(`API 请求失败：${message}。${buildEndpointHint('API', endpoint)}`)
}

export function formatSocketErrorMessage(endpoint, error) {
  const message = getRawErrorMessage(error)
  return `WebSocket 连接失败：${message}。${buildEndpointHint('WebSocket', endpoint)}`
}
