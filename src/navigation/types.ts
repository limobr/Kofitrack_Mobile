export type RootStackParamList = {
  Main: undefined
  RecordDelivery: undefined
  RecordTransaction: undefined
  Transactions: undefined
  AddMember: undefined
  EditMember: { memberId: string }
  CumulativeDetail: { memberId: string; memberName: string; memberReg: string }
  Account: undefined
  Login: undefined
  SyncLogs: undefined
  PrinterSettings: undefined
  PinLock: undefined
  PrintQueue: undefined
  Analytics: undefined
  Cumulatives: undefined
}