"use client";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Tabs } from "@base-ui/react/tabs";
import { Select } from "@base-ui/react/select";
import { Toast } from "@base-ui/react/toast";
import { Tooltip } from "@base-ui/react/tooltip";
import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
import { Switch } from "@base-ui/react/switch";
import { Avatar } from "@base-ui/react/avatar";
import { Popover } from "@base-ui/react/popover";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
export function UI() {
  const toast = Toast.useToastManager();
  return (<>
    <Button className="data-[disabled]:opacity-50" onClick={() => toast.add({ title: "Saved", description: "ok", type: "success" })}>Save</Button>
    <Dialog.Root><Dialog.Trigger>Open</Dialog.Trigger><Dialog.Portal><Dialog.Backdrop /><Dialog.Popup><Dialog.Title>T</Dialog.Title><Dialog.Description>D</Dialog.Description><Dialog.Close>x</Dialog.Close></Dialog.Popup></Dialog.Portal></Dialog.Root>
    <Menu.Root><Menu.Trigger>M</Menu.Trigger><Menu.Portal><Menu.Positioner sideOffset={4}><Menu.Popup><Menu.Item onClick={() => {}}>A</Menu.Item><Menu.Separator /></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
    <Tabs.Root defaultValue="a"><Tabs.List><Tabs.Tab value="a">A</Tabs.Tab><Tabs.Indicator /></Tabs.List><Tabs.Panel value="a">x</Tabs.Panel></Tabs.Root>
    <Select.Root items={[{ value: "a", label: "A" }]} defaultValue="a" onValueChange={(v) => void v}><Select.Trigger><Select.Value /><Select.Icon /></Select.Trigger><Select.Portal><Select.Positioner><Select.Popup><Select.List><Select.Item value="a"><Select.ItemText>A</Select.ItemText><Select.ItemIndicator>✓</Select.ItemIndicator></Select.Item></Select.List></Select.Popup></Select.Positioner></Select.Portal></Select.Root>
    <Tooltip.Provider><Tooltip.Root><Tooltip.Trigger>?</Tooltip.Trigger><Tooltip.Portal><Tooltip.Positioner><Tooltip.Popup>tip</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
    <Field.Root name="email" invalid={false}><Field.Label>Email</Field.Label><Field.Control type="email" required /><Field.Description>d</Field.Description><Field.Error match="valueMissing">Required</Field.Error></Field.Root>
    <Input placeholder="x" />
    <Switch.Root checked onCheckedChange={(c) => void c}><Switch.Thumb /></Switch.Root>
    <Avatar.Root><Avatar.Image src="/a.png" /><Avatar.Fallback>AB</Avatar.Fallback></Avatar.Root>
    <Popover.Root><Popover.Trigger>P</Popover.Trigger><Popover.Portal><Popover.Positioner><Popover.Popup><Popover.Title>t</Popover.Title></Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>
    <Markdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{"**hi** <b>raw</b>"}</Markdown>
  </>);
}
export function Toaster() {
  const { toasts } = Toast.useToastManager();
  return <Toast.Portal><Toast.Viewport>{toasts.map((t) => <Toast.Root key={t.id} toast={t}><Toast.Content><Toast.Title /><Toast.Description /><Toast.Close>x</Toast.Close></Toast.Content></Toast.Root>)}</Toast.Viewport></Toast.Portal>;
}
export function App({ children }: { children: React.ReactNode }) { return <Toast.Provider timeout={5000} limit={3}>{children}<Toaster /></Toast.Provider>; }
