export interface EnvVariable {
  key: string;
  value: string;
  section: string;
}

export interface ChangeInfo {
  key: string;
  oldValue: string;
  newValue: string;
}

export interface SetupVariableContext {
  existingEnv: Map<string, string>;
  isUpdating: boolean;
  newVariables: EnvVariable[];
  changes: ChangeInfo[];
}
