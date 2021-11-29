import type { AnchorTypes } from "@saberhq/anchor-contrib";

import type { UquarryUoperatorIDL } from "../idls/quarry_operator";

export * from "../idls/quarry_operator";

export type QuarryOperatorTypes = AnchorTypes<
  UquarryUoperatorIDL,
  {
    operator: OperatorData;
  }
>;

type Accounts = QuarryOperatorTypes["Accounts"];
export type OperatorData = Accounts["Operator"];

export type QuarryOperatorError = QuarryOperatorTypes["Error"];
export type QuarryOperatorProgram = QuarryOperatorTypes["Program"];
