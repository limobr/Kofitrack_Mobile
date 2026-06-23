export type RootStackParamList = {
  Main: undefined
  RecordDelivery: undefined
  RecordTransaction: undefined
  AddMember: undefined
  EditMember: { memberId: string }
  CumulativeDetail: { memberId: string; memberName: string; memberReg: string }
  Account: undefined
  Login: undefined
  SyncLogs: undefined
  PrinterSettings: undefined   // ✅ new
  PinLock: undefined           // ✅ new
}