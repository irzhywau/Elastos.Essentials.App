import { Profile } from './profile.model';
import { ApiNoAuthorityException } from "./exceptions/apinoauthorityexception.exception";
import { BasicCredentialsService } from '../services/basiccredentials.service';
import { DIDDocument } from './diddocument.model';
import { DIDURL } from './didurl.model';
import { DIDHelper } from '../helpers/did.helper';
import { DIDEvents } from '../services/events';
import { VerifiableCredential } from './verifiablecredential.model';
import { Avatar } from '../services/hive.service';
import { ProfileService } from '../services/profile.service';
import { Events } from '../services/events.service';
import { DIDSessionsService } from 'src/app/services/didsessions.service';

export class DID {
    public credentials: VerifiableCredential[] = [];
    public DisplayCredentials = [];

    private didDocument: DIDDocument;

    constructor(public pluginDid: DIDPlugin.DID, private events: Events, private didSessions: DIDSessionsService) {
    }

    public async loadAll() {
        await this.loadAllCredentials();
    }

    public getDIDString() {
        return this.pluginDid.getDIDString();
    }

    /**
     * Gets the list of unloaded credentials then load them one by one.
     * After this call, all credentials related to the active DID of this DID store are loaded
     * in memory.
     */
    async loadAllCredentials() {
        console.log("Loading credentials for DID", this);

        let pluginCredentials = await this.loadPluginCredentials();

        this.credentials = [];
        pluginCredentials.map((c) => {
            this.credentials.push(new VerifiableCredential(c));
        })

        console.log("Current credentials list: ", this.credentials);

        //this.DisplayCredentials = this.profileService.allCreds;
    }

    private loadPluginCredentials(): Promise<DIDPlugin.VerifiableCredential[]> {
        return new Promise(async (resolve, reject) => {
            this.pluginDid.loadCredentials(
                (ret) => { resolve(ret) }, (err) => { reject(err) },
            );
        });
    }

    /**
     */
    async addCredential(credentialId: DIDURL, props: any, password: string, userTypes?: String[]): Promise<DIDPlugin.VerifiableCredential> {
        return new Promise(async (resolve, reject) => {
            console.log("Adding credential with id:", credentialId, props, userTypes);

            let types: String[] = [
                "SelfProclaimedCredential"
            ];
            // types[0] = "BasicProfileCredential";

            // If caller provides custom types, we add them to the list
            // TODO: This is way too simple for now. We need to deal with types schemas in the future.
            if (userTypes) {
                userTypes.map((type) => {
                    types.push(type);
                })
            }

            let credential: DIDPlugin.VerifiableCredential = null;
            try {
                console.log("Asking DIDService to create the credential with id " + credentialId);
                // the max validity days is 5*365 (5 years).
                credential = await this.createPluginCredential(credentialId, types, 5 * 365, props, password);
                console.log("Created credential:", JSON.parse(JSON.stringify(credential)));
            }
            catch (e) {
                console.error("Create credential exception", e);
                if (typeof (e) === "string" && e.includes("have not run authority")) {
                    reject(new ApiNoAuthorityException(e));
                } else {
                    reject(DIDHelper.reworkedPluginException(e))
                }
                return;
            }

            let vc = new VerifiableCredential(credential);
            await this.addRawCredential(vc);

            resolve(credential);
        });
    }

    async addRawCredential(vc: VerifiableCredential) {
        console.log("Asking DIDService to store the credential", vc);
        await this.addPluginCredential(vc.pluginVerifiableCredential);

        console.log("Credential successfully added");

        // Add the new credential to the memory model
        this.credentials.push(vc);

        // Notify listeners that a credential has been added
        this.events.publish('did:credentialadded');
    }

    getCredentialById(credentialId: DIDURL): VerifiableCredential {
        if (!this.credentials)
            return null;

        return this.credentials.find((c) => {
            return credentialId.matches(c.pluginVerifiableCredential.getId());
        });
    }

    /**
     * Based on some predefined basic credentials (name, email...) we build a Profile structure
     * to ease profile editing on UI.
     */
    getBasicProfile(): Profile {
        //let profile = Profile.createDefaultProfile();
        let profile = new Profile();

        // // We normally have one credential for each profile field
        // this.credentials.map((cred) => {
        //     let props = cred.pluginVerifiableCredential.getSubject(); // Credentials properties
        //     if (!props) {
        //         console.warn("Found an empty credential subject while trying to build profile, this should not happen...");
        //         return;
        //     }

        //     // Loop over each property in the credential (even if normally there is only one property per credential)
        //     for (let p of Object.keys(props)) {
        //         // Skip the special entry "id" that exists in every credential.
        //         if (p == "id") continue;

        //         // Try to retrieve a standard property info from this property
        //         let basicCredentialInfo = BasicCredentialsService.instance.getBasicCredentialInfoByKey(p);
        //         if (!basicCredentialInfo) {
        //             console.warn("Unhandled basic credential " + p);
        //         }
        //         else {
        //             profile.setValue(basicCredentialInfo, props[p]);
        //         }
        //     }
        // });

        console.log("Basic profile:", profile);
        return profile;
    }


    /**
     * Overwrites profile info using a new profile. Each field info is updated
     * into its respective credential.
     *
     * Returns true if local did document has been modified, false otherwise.
     */
    public writeProfile(newProfile: Profile, password: string): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            console.log("Writing profile fields as credentials", newProfile);

            let localDidDocumentHasChanged = false;

            // Delete all entries that were here before, and not any more in the new profile
            let currentProfile = this.getBasicProfile();
            for (let basicProfileKey of BasicCredentialsService.instance.getBasicCredentialkeys()) {
                let entryExistingInNewProfile = newProfile.getEntryByKey(basicProfileKey);
                if (!entryExistingInNewProfile) {
                    console.log("Deleting profile entry " + basicProfileKey + " from current DID as it's not in the profile any more.");

                    // Delete the credential
                    let credentialId = new DIDURL("#" + basicProfileKey);
                    let existingCredential = this.getCredentialById(credentialId);
                    if (existingCredential) {
                        console.log("Deleting credential with id " + existingCredential.pluginVerifiableCredential.getId() + " as it's being deleted from user profile.");
                        await this.deleteCredential(new DIDURL(existingCredential.pluginVerifiableCredential.getId()));
                    }

                    // Remove the info from the DID document, if any
                    let currentDidDocument = this.getDIDDocument();
                    if (currentDidDocument) {
                        let documentCredential = currentDidDocument.getCredentialById(credentialId);
                        if (documentCredential) {
                            console.log("Deleting credential from local DID document");
                            await currentDidDocument.deleteCredential(documentCredential, password);
                            localDidDocumentHasChanged = true;
                        }
                    }
                }
            }

            // Update or insert all entries existing in the new profile
            for (let entry of newProfile.entries) {
                let props = {};
                props[entry.key] = entry.value;

                let credentialId = new DIDURL("#" + entry.key);
                if (!this.credentialContentHasChanged(credentialId, entry.value)) {
                    console.log("Not updating credential " + entry.key + " as it has not changed");
                    continue; // SKip this credential, go to next one.
                }

                try {
                    // Update use case: if this credential already exist, we delete it first before re-creating it.
                    let existingCredential = this.getCredentialById(credentialId);
                    if (existingCredential) {
                        console.log("Credential with id " + existingCredential.pluginVerifiableCredential.getId() + " already exists - deleting");
                        await this.deleteCredential(new DIDURL(existingCredential.pluginVerifiableCredential.getId()));
                    }

                    console.log("Adding credential for profile key " + entry.key);
                    try {
                        let credential = await this.addCredential(credentialId, props, password, ["BasicProfileCredential"]);
                        console.log("Credential added:", credential);

                        // Update the DID Document in case it contains the credential. Then we will have to
                        // ask user if he wants to publish a new version of his did document on chain.
                        let currentDidDocument = this.getDIDDocument();
                        if (currentDidDocument) {
                            let documentCredential = currentDidDocument.getCredentialById(credentialId);
                            if (documentCredential) {
                                // User's did document contains this credential being modified, so we updated the
                                // document.
                                console.log("Updating local DID document");
                                await currentDidDocument.updateOrAddCredential(credential, password);
                                localDidDocumentHasChanged = true;
                            }
                        }
                    }
                    catch (e) {
                        throw e;
                    }

                    console.log("New credentials list:", JSON.parse(JSON.stringify(this.credentials)));

                    // Special handler for the special "name" field
                    if (entry.key == "name") {
                        // Save this new name in the did session plugin.
                        let signedInEntry = await this.didSessions.getSignedInIdentity();
                        signedInEntry.name = entry.value;
                        await this.didSessions.addIdentityEntry(signedInEntry);

                        // Let listeners know
                        DIDEvents.instance.events.publish("did:namechanged");
                    }

                    // Special handler for the special "avatar" field
                    if (entry.key == "avatar") {
                        let avatar: Avatar = entry.value as Avatar;
                        console.log("Saving avatar info to signed in identity", avatar)

                        // For now we only know how to save base64 avatars. Other formats are unsupported
                        if (avatar.type === "base64") {
                            // Save this new avatar in the did session plugin.
                            let signedInEntry = await this.didSessions.getSignedInIdentity();
                            signedInEntry.avatar = {
                                contentType: avatar["content-type"],
                                base64ImageData: avatar.data
                            }
                            await this.didSessions.addIdentityEntry(signedInEntry);

                            // Let listeners know
                            DIDEvents.instance.events.publish("did:avatarchanged");
                        }
                    }
                }
                catch (e) {
                    // We may have catched a wrong password exception - stop the loop here.
                    reject(e);
                    return;
                }

                this.events.publish("credentials:modified");
            }

            console.log("Credentials after write profile:", this.credentials);

            resolve(localDidDocumentHasChanged);
        });
    }

    /**
     * Checks if a given credential exists in current DID
     */
    credentialExists(credentialId: DIDURL): boolean {
        return (this.credentials.find((c) => {
            return credentialId.matches(c.pluginVerifiableCredential.getId());
        }) != null);
    }

    /**
     * Compares the given credential properties with an existing credential properties to see if
     * something has changed or not. This function is used to make sure we don't try to delete/re-create
     * an existing creedntial on profile update, in case nothing has changed (performance)
     */
    credentialContentHasChanged(credentialId: DIDURL, newProfileValue: string) {
        let currentCredential: VerifiableCredential = this.credentials.find((c) => {
            return credentialId.matches(c.pluginVerifiableCredential.getId());
        });

        if (!currentCredential) {
            console.log("Credential has changed because credential with id " + credentialId + " not found in DID");
            return true; // Doesn't exist? consider this has changed.
        }

        // NOTE: FLAT comparison only for now, not deep.
        let currentProps = currentCredential.pluginVerifiableCredential.getSubject();
        let credentialFragment = currentCredential.pluginVerifiableCredential.getFragment();
        if (currentProps[credentialFragment] != newProfileValue) {
            console.log("Credential has changed because " + currentProps[credentialFragment] + " <> " + newProfileValue);
            return true;
        }

        return false;
    }

    private createPluginCredential(credentialId: DIDURL, type, validityDays, properties, passphrase): Promise<DIDPlugin.VerifiableCredential> {
        return new Promise(async (resolve, reject) => {
            this.pluginDid.issueCredential(
                this.getDIDString(), credentialId.toString(), type, validityDays, properties, passphrase,
                (ret) => { resolve(ret) },
                (err) => { reject(DIDHelper.reworkedPluginException(err)) },
            );
        });
    }

    public async deleteCredential(credentialDidUrl: DIDURL): Promise<boolean> {
        console.log("Asking DIDService to delete the credential " + credentialDidUrl);

        await this.deletePluginCredential(credentialDidUrl);

        // Delete from our local model as well
        console.log("Deleting credential from local model", this.credentials);
        let deletionIndex = this.credentials.findIndex((c) => {
            let match = credentialDidUrl.matches(c.pluginVerifiableCredential.getId());
            return match;
        });
        if (deletionIndex == -1) {
            console.warn("Unable to delete credential from local model! Not found...", credentialDidUrl);
            return false;
        }
        this.credentials.splice(deletionIndex, 1);

        return true;
    }

    private deletePluginCredential(didUrlString: DIDURL): Promise<any> {
        return new Promise<void>(async (resolve, reject) => {
            this.pluginDid.deleteCredential(
                didUrlString.toString(),
                () => { resolve() }, (err) => {
                    console.error("Delete credential exception", err);
                    reject(DIDHelper.reworkedPluginException(err));
                },
            );
        });
    }

    private addPluginCredential(credential: DIDPlugin.VerifiableCredential): Promise<void> {
        console.log("DIDService - storeCredential", this.getDIDString(), JSON.parse(JSON.stringify(credential)));
        return new Promise(async (resolve, reject) => {
            console.log("DIDService - Calling real storeCredential");
            this.pluginDid.addCredential(
                credential,
                () => {
                    resolve()
                }, (err) => {
                    console.error("Add credential exception", err);
                    reject(DIDHelper.reworkedPluginException(err));
                },
            );
        });
    }

    public async resolveDidDocument(didString: string): Promise<DIDDocument> {
        let pluginDidDocument = await this.resolvePluginDidDocument(didString);
        return new DIDDocument(pluginDidDocument);
    }

    private resolvePluginDidDocument(didString: string): Promise<DIDPlugin.DIDDocument> {
        return new Promise((resolve, reject) => {
            this.pluginDid.resolveDidDocument(
                (didDocument) => {
                    resolve(didDocument)
                }, (err) => {
                    reject(err)
                },
            );
        });
    }

    createVerifiablePresentationFromCredentials(credentials: DIDPlugin.VerifiableCredential[], storePass: string, nonce: string, realm: string): Promise<DIDPlugin.VerifiablePresentation> {
        return new Promise(async (resolve, reject) => {
            this.pluginDid.createVerifiablePresentation(credentials, realm, nonce, storePass, (presentation: DIDPlugin.VerifiablePresentation) => {
                resolve(presentation);
            }, (err) => {
                console.error("Create presentation exception", err);
                reject(DIDHelper.reworkedPluginException(err));
            });
        });
    }

    public signData(data: string, storePass: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            this.didDocument.pluginDidDocument.sign(storePass, data,
                (ret) => {
                    resolve(ret)
                }, (err) => {
                    reject(DIDHelper.reworkedPluginException(err));
                },
            );
        });
    }

    public setLoadedDIDDocument(didDocument: DIDDocument) {
        console.log("Setting loaded did document to:", didDocument);
        this.didDocument = didDocument;
    }

    public getDIDDocument(): DIDDocument {
        return this.didDocument;
    }
}
