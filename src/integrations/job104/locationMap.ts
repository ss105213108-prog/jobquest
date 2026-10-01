// Verified public 104 classifications; null means omit area, never an empty value.
export const location104Map = {
  全部地區: null,
  台北市: '6001001000',
  新北市: '6001002000',
  桃園市: '6001005000',
  台中市: '6001008000',
  台南市: '6001014000',
  高雄市: '6001016000',
  基隆市: '6001004000',
  新竹市: '6001006001',
  新竹縣市: '6001006000',
  嘉義市: '6001013001',
  嘉義縣市: '6001013000',
  苗栗縣: '6001007000',
  彰化縣: '6001010000',
  南投縣: '6001011000',
  雲林縣: '6001012000',
  屏東縣: '6001018000',
  宜蘭縣: '6001003000',
  花蓮縣: '6001020000',
  台東縣: '6001019000',
  澎湖縣: '6001021000',
  金門縣: '6001022000',
  連江縣: '6001023000',
} as const

export type Supported104Location = keyof typeof location104Map

export function get104AreaCode(location: string): string | null {
  return isSupported104Location(location) ? location104Map[location] : null
}

export function isSupported104Location(location: string): location is Supported104Location {
  return Object.prototype.hasOwnProperty.call(location104Map, location)
}
