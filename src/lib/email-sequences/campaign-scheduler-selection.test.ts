import { expect, it } from "vitest";
import { parseCampaignSchedulerSelection } from "./campaign-scheduler-selection";

it("defaults to disabled and preserves an exact finite selection", () => {
  expect(parseCampaignSchedulerSelection(undefined)).toBeNull();
  expect(parseCampaignSchedulerSelection(" ")).toBeNull();
  expect(parseCampaignSchedulerSelection('{"clientId":"client","sequenceIds":["one","two"]}'))
    .toEqual({ clientId: "client", sequenceIds: ["one", "two"] });
});
it.each(['null', '[]', '{}', '{"clientId":"client"}', '{"clientId":"client","sequenceIds":[]}',
  '{"clientId":"client","sequenceIds":["one"],"all":true}', '{"clientId":"client","sequenceIds":[1]}',
  '{"clientId":"client","sequenceIds":["one","one"]}', '{bad'])
  ("rejects ambiguous selection %s", raw => expect(() => parseCampaignSchedulerSelection(raw)).toThrow());
