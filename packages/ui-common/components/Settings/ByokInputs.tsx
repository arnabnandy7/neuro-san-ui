/*
Copyright 2026 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import Box from "@mui/material/Box"
import {useTheme} from "@mui/material/styles"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import {FC, useCallback, useMemo, useState} from "react"

import {ApiKeyErrorBanner, ApiKeyFailure} from "./ApiKeyErrorBanner"
import {ApiKeyInput} from "./ApiKeyInput"
import {useCheckmarkFade} from "./FadingCheckmark"
import {SettingsRow} from "./SettingsRow"
import {
    isAnthropicKeyValid,
    isOpenAIKeyValid,
    KeyValidationFailure,
    KeyValidationResult,
} from "../../controller/llm/Providers"
import {API_KEYS_TTL_MS, getApiKey, LLMProvider, useSettingsStore} from "../../state/Settings"

interface LLMProviderInputConfig {
    /** Fade-in checkmark animation state for the key validation indicator. */
    readonly checkmark: ReturnType<typeof useCheckmarkFade>
    /** Suffix appended to the base element ID to uniquely identify this provider's input. */
    readonly idSuffix: string
    /** Path to the provider's logo image. */
    readonly logo: string
    /** Callback that validates the given API key for this provider. */
    readonly onTest: (key: string) => Promise<KeyValidationResult>
    /** Placeholder text shown in the API key input field. */
    readonly placeholder: string
    /** The LLM provider this configuration applies to. */
    readonly vendor: LLMProvider
}

export interface UseByokKeyManagerOptions {
    /** Callback invoked when the parent dialog should close. */
    readonly onClose?: () => void
    /** Optional filter for which LLM providers to include. If omitted, all supported providers are shown. */
    readonly supportedProviders?: ReadonlySet<LLMProvider> | readonly LLMProvider[]
}

export interface UseByokKeyManagerReturn {
    /** Active provider configurations, filtered by `supportedProviders` if provided. */
    readonly activeConfigs: readonly LLMProviderInputConfig[]
    /** All provider configurations without filtering. */
    readonly apiKeyConfigs: readonly LLMProviderInputConfig[]
    /** Close handler that prompts with confirmation modal if there are unsaved draft keys. */
    readonly handleClose: () => void
    /** Discard handler that clears drafts, closes the unsaved changes modal, and closes the dialog. */
    readonly handleDiscard: () => void
    /** Callback when an API key test completes with a validation failure or success. */
    readonly handleKeyResultChange: (vendor: LLMProvider, result: KeyValidationFailure | null) => void
    /** Save handler that saves all pending draft keys, closes modal, and closes the dialog. */
    readonly handleSave: () => void
    /** Callback when an API key input's text value changes (tracking draft keys). */
    readonly handleValueChange: (vendor: LLMProvider, value: string) => void
    /** Whether any active provider has unsaved draft changes. */
    readonly hasUnsavedKeys: boolean
    /** Current validation failures across all active providers. */
    readonly keyFailures: readonly ApiKeyFailure[]
    /** Persists an API key for a given vendor to the store. */
    readonly persistKey: (
        vendor: LLMProvider,
        key: string,
        checkmark: ReturnType<typeof useCheckmarkFade>,
        now: number
    ) => void
    /** State updater for whether the unsaved changes modal is displayed. */
    readonly setShowUnsavedChangesModal: (show: boolean) => void
    /** Whether the unsaved changes confirmation modal is currently open. */
    readonly showUnsavedChangesModal: boolean
}

/**
 * Hook to manage Bring Your Own Key (BYOK) state, draft changes, validation, and unsaved changes lifecycle.
 *
 * @param options Hook options including close callback and optional provider filter
 * @return BYOK state and handlers
 */
export const useByokKeyManager = ({
    onClose,
    supportedProviders,
}: UseByokKeyManagerOptions = {}): UseByokKeyManagerReturn => {
    const theme = useTheme()
    const apiKeys = useSettingsStore((state) => state.settings.apiKeys)
    const updateSettings = useSettingsStore((state) => state.updateSettings)

    const openAIKeyCheckmark = useCheckmarkFade()
    const anthropicKeyCheckmark = useCheckmarkFade()

    const [keyTestResults, setKeyTestResults] = useState<Partial<Record<LLMProvider, ApiKeyFailure | null>>>({})
    const [draftKeys, setDraftKeys] = useState<Partial<Record<LLMProvider, string>>>({})
    const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState<boolean>(false)

    const apiKeyConfigs: LLMProviderInputConfig[] = useMemo(
        () => [
            {
                checkmark: openAIKeyCheckmark,
                idSuffix: "openai",
                logo: theme.palette.mode === "dark" ? "/OpenAI-white.png" : "/OpenAI-black.png",
                onTest: isOpenAIKeyValid,
                placeholder: "sk-...",
                vendor: "OpenAI",
            },
            {
                checkmark: anthropicKeyCheckmark,
                idSuffix: "anthropic",
                logo: "/claude.png",
                onTest: isAnthropicKeyValid,
                placeholder: "sk-ant-...",
                vendor: "Anthropic",
            },
        ],
        [openAIKeyCheckmark, anthropicKeyCheckmark, theme.palette.mode]
    )

    const activeConfigs = useMemo(() => {
        if (!supportedProviders) {
            return apiKeyConfigs
        }
        const providerSet = supportedProviders instanceof Set ? supportedProviders : new Set(supportedProviders)
        return apiKeyConfigs.filter(({vendor}) => providerSet.has(vendor))
    }, [apiKeyConfigs, supportedProviders])

    const handleKeyResultChange = useCallback((vendor: LLMProvider, result: KeyValidationFailure | null) => {
        setKeyTestResults((prev) => ({
            ...prev,
            [vendor]: result ? {vendor, result} : null,
        }))
    }, [])

    const handleValueChange = useCallback((vendor: LLMProvider, value: string) => {
        setDraftKeys((prev) => ({
            ...prev,
            [vendor]: value,
        }))
    }, [])

    const persistKey = useCallback(
        (vendor: LLMProvider, key: string, checkmark: ReturnType<typeof useCheckmarkFade>, now: number) => {
            updateSettings({
                apiKeys: {
                    [vendor]: {
                        value: key,
                        expiresAt: key ? now + API_KEYS_TTL_MS : 0,
                    },
                },
            })
            setDraftKeys((prev) => ({
                ...prev,
                [vendor]: undefined,
            }))
            checkmark.trigger()
        },
        [updateSettings]
    )

    const hasUnsavedKeys = useMemo(() => {
        return activeConfigs.some(({vendor}) => {
            const draft = draftKeys[vendor]
            if (draft === undefined) {
                return false
            }
            const persisted = getApiKey(apiKeys, vendor) ?? ""
            return draft !== persisted
        })
    }, [activeConfigs, draftKeys, apiKeys])

    const handleClose = useCallback(() => {
        if (hasUnsavedKeys) {
            setShowUnsavedChangesModal(true)
            return
        }
        onClose?.()
    }, [hasUnsavedKeys, onClose])

    const handleDiscard = useCallback(() => {
        setDraftKeys({})
        setShowUnsavedChangesModal(false)
        onClose?.()
    }, [onClose])

    const handleSave = useCallback(() => {
        const now = Date.now()
        activeConfigs.forEach(({checkmark, vendor}) => {
            const draft = draftKeys[vendor]
            if (draft !== undefined && draft !== (getApiKey(apiKeys, vendor) ?? "")) {
                persistKey(vendor, draft, checkmark, now)
            }
        })
        setDraftKeys({})
        setShowUnsavedChangesModal(false)
        onClose?.()
    }, [activeConfigs, draftKeys, apiKeys, persistKey, onClose])

    const keyFailures: ApiKeyFailure[] = useMemo(() => {
        return activeConfigs.flatMap(({vendor}) => {
            const failure = keyTestResults[vendor]
            return failure ? [failure] : []
        })
    }, [activeConfigs, keyTestResults])

    return {
        activeConfigs,
        apiKeyConfigs,
        handleClose,
        handleDiscard,
        handleKeyResultChange,
        handleSave,
        handleValueChange,
        hasUnsavedKeys,
        keyFailures,
        persistKey,
        setShowUnsavedChangesModal,
        showUnsavedChangesModal,
    }
}

export interface ByokInputsProps {
    /** List of provider configurations to display as input rows. */
    readonly configs: readonly LLMProviderInputConfig[]
    /** Base element ID for testing and DOM references. */
    readonly id: string
    /** Current key validation failures to display in the error banner. */
    readonly keyFailures: readonly ApiKeyFailure[]
    /** Callback invoked when key test validation results change. */
    readonly onKeyResultChange: (vendor: LLMProvider, result: KeyValidationFailure | null) => void
    /** Callback invoked to persist an API key for a vendor. */
    readonly onPersistKey: (
        vendor: LLMProvider,
        key: string,
        checkmark: ReturnType<typeof useCheckmarkFade>,
        now: number
    ) => void
    /** Callback invoked when an API key input's text value changes. */
    readonly onValueChange: (vendor: LLMProvider, value: string) => void
}

/**
 * Component that renders the BYOK API key input rows with validation error banner.
 *
 * @param props Component properties
 * @return BYOK inputs element
 */
export const ByokInputs: FC<ByokInputsProps> = ({
    configs,
    id,
    keyFailures,
    onKeyResultChange,
    onPersistKey,
    onValueChange,
}) => {
    const apiKeys = useSettingsStore((state) => state.settings.apiKeys)

    return (
        <>
            <ApiKeyErrorBanner
                failures={keyFailures}
                id={`${id}-api-key-error-banner`}
            />
            <Box sx={{display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, mt: 1}}>
                {configs.map(({checkmark, vendor, idSuffix, logo, onTest, placeholder}) => (
                    <SettingsRow
                        checkmark={checkmark}
                        key={`${id}-${idSuffix}`}
                        label=""
                        tooltip={`API key for ${vendor}.`}
                    >
                        <ApiKeyInput
                            forgetKey={() => onPersistKey(vendor, "", checkmark, 0)}
                            id={`${id}-${idSuffix}`}
                            logo={logo}
                            onResultChange={onKeyResultChange}
                            onSave={(key) => onPersistKey(vendor, key, checkmark, Date.now())}
                            onTest={onTest}
                            onValueChange={onValueChange}
                            persistedValue={getApiKey(apiKeys, vendor)}
                            placeholder={placeholder}
                            vendor={vendor}
                        />
                    </SettingsRow>
                ))}
            </Box>
        </>
    )
}

/**
 * Tooltip explaining how BYOK API keys are stored in session memory and used.
 */
export const ByokStorageTooltip: FC = () => (
    <Tooltip
        title="API keys are stored locally in your browser's memory for the duration of your session only
        and are only sent to the Neuro SAN service for use with the associated LLM provider when you use
        this application to interact with networks.
        Your keys are never sent to any other servers or services and are not stored on our servers.
        When you close this tab or your browser, your keys will be permanently cleared from memory and
        you will need to enter them again to use services that require them."
    >
        <Typography
            sx={{
                alignSelf: "flex-start",
                color: "var(--bs-secondary)",
                cursor: "help",
                fontSize: "0.7rem",
                lineHeight: 1,
                mt: 0.5,
            }}
            variant="caption"
        >
            <Box
                component="span"
                sx={{mr: 0.5}}
            >
                ⓘ
            </Box>
            <Box
                component="span"
                sx={{
                    borderBottom: "1px dashed",
                    pb: 0.25,
                }}
            >
                How are my keys stored and used?
            </Box>
        </Typography>
    </Tooltip>
)
