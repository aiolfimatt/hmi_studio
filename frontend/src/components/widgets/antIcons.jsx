import React from 'react'
import {
  HomeOutlined, AppstoreOutlined, MenuOutlined, DashboardOutlined,
  PlayCircleOutlined, PauseCircleOutlined, StopOutlined, PoweroffOutlined, CaretRightOutlined,
  ReloadOutlined, SyncOutlined, RedoOutlined, UndoOutlined, StepForwardOutlined, StepBackwardOutlined,
  ArrowUpOutlined, ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined,
  UpOutlined, DownOutlined, LeftOutlined, RightOutlined,
  WarningOutlined, AlertOutlined, ExclamationCircleOutlined, BellOutlined, FireOutlined,
  CheckOutlined, CheckCircleOutlined, CloseOutlined, CloseCircleOutlined,
  LockOutlined, UnlockOutlined, SafetyOutlined,
  SettingOutlined, ToolOutlined, ControlOutlined, ApiOutlined,
  UserOutlined, TeamOutlined, InfoCircleOutlined, QuestionCircleOutlined,
  ThunderboltOutlined, BulbOutlined, ExperimentOutlined, DatabaseOutlined,
  LineChartOutlined, BarChartOutlined, AreaChartOutlined, FundOutlined,
  ClockCircleOutlined, FieldTimeOutlined, HistoryOutlined,
  SaveOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PrinterOutlined,
  FileOutlined, FolderOutlined, SearchOutlined,
  PlusOutlined, MinusOutlined, PlusCircleOutlined, MinusCircleOutlined,
  WifiOutlined, DisconnectOutlined,
} from '@ant-design/icons'

export const ANT_ICON_PREFIX = 'ant:'

// Curated, HMI/industrial-relevant subset of the Ant Design icon set.
// name (as stored, without prefix) -> component
export const ANT_ICONS = {
  HomeOutlined, AppstoreOutlined, MenuOutlined, DashboardOutlined,
  PlayCircleOutlined, PauseCircleOutlined, StopOutlined, PoweroffOutlined, CaretRightOutlined,
  ReloadOutlined, SyncOutlined, RedoOutlined, UndoOutlined, StepForwardOutlined, StepBackwardOutlined,
  ArrowUpOutlined, ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined,
  UpOutlined, DownOutlined, LeftOutlined, RightOutlined,
  WarningOutlined, AlertOutlined, ExclamationCircleOutlined, BellOutlined, FireOutlined,
  CheckOutlined, CheckCircleOutlined, CloseOutlined, CloseCircleOutlined,
  LockOutlined, UnlockOutlined, SafetyOutlined,
  SettingOutlined, ToolOutlined, ControlOutlined, ApiOutlined,
  UserOutlined, TeamOutlined, InfoCircleOutlined, QuestionCircleOutlined,
  ThunderboltOutlined, BulbOutlined, ExperimentOutlined, DatabaseOutlined,
  LineChartOutlined, BarChartOutlined, AreaChartOutlined, FundOutlined,
  ClockCircleOutlined, FieldTimeOutlined, HistoryOutlined,
  SaveOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PrinterOutlined,
  FileOutlined, FolderOutlined, SearchOutlined,
  PlusOutlined, MinusOutlined, PlusCircleOutlined, MinusCircleOutlined,
  WifiOutlined, DisconnectOutlined,
}

export const ANT_ICON_NAMES = Object.keys(ANT_ICONS)

export function isAntIcon(value) {
  return typeof value === 'string' && value.startsWith(ANT_ICON_PREFIX)
}
export function antIconName(value) {
  return isAntIcon(value) ? value.slice(ANT_ICON_PREFIX.length) : null
}
export function toAntIconValue(name) {
  return `${ANT_ICON_PREFIX}${name}`
}

/**
 * AntIcon — render a curated Ant Design icon by name.
 * Props: name (without prefix), size (px), color, className, style
 */
export function AntIcon({ name, size = 20, color, className, style }) {
  const Cmp = ANT_ICONS[name]
  if (!Cmp) return null
  return <Cmp className={className} style={{ fontSize: size, color, lineHeight: 0, ...style }} />
}
