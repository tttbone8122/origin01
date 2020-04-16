import React, { useState } from 'react';
import {
    Paper,
    Typography,
    FormControl,
    Grid,
    Button,
    useTheme,
    makeStyles,
    createStyles
} from '@material-ui/core';
import { useSelector, useDispatch } from 'react-redux';
import { getConfiguration, getEnvironment } from '../features';
import { Formik, Field, Form, FormikHelpers } from 'formik';
import { TextField, CheckboxWithLabel } from 'formik-material-ui';
import { useHistory } from 'react-router-dom';
import {
    useLinks,
    areDeviceSpecificPropertiesValid,
    PowerFormatter,
    showNotification,
    NotificationType,
    useValidation,
    useTranslation,
    useDevicePermissions,
    Moment
} from '../utils';
import { FormikDatePicker } from './Form/FormikDatePicker';
import { getUserOffchain } from '../features/users/selectors';
import { setLoading } from '../features/general/actions';
import {
    getExternalDeviceIdTypes,
    getCompliance,
    getCountry,
    getOffChainDataSource
} from '../features/general/selectors';
import { HierarchicalMultiSelect } from './HierarchicalMultiSelect';
import { CloudUpload } from '@material-ui/icons';
import { ProducingDevice } from '@energyweb/device-registry';
import { producingDeviceCreatedOrUpdated } from '../features/producingDevices/actions';
import { DeviceStatus, IExternalDeviceId } from '@energyweb/origin-backend-core';
import { Skeleton } from '@material-ui/lab';
import { FormInput } from './Form';
import { DeviceSelectors } from './DeviceSelectors';
import { DevicePermissionsFeedback } from './DevicePermissionsFeedback';

interface IFormValues {
    facilityName: string;
    capacity: string;
    commissioningDate: Moment;
    registrationDate: Moment;
    address: string;
    latitude: string;
    longitude: string;
    supported: boolean;
    projectStory: string;
}

const INITIAL_FORM_VALUES: IFormValues = {
    facilityName: '',
    capacity: '',
    commissioningDate: null,
    registrationDate: null,
    address: '',
    latitude: '',
    longitude: '',
    supported: false,
    projectStory: ''
};

export function AddDevice() {
    const user = useSelector(getUserOffchain);
    const configuration = useSelector(getConfiguration);
    const compliance = useSelector(getCompliance);
    const country = useSelector(getCountry);
    const offChainDataSource = useSelector(getOffChainDataSource);
    const externalDeviceIdTypes = useSelector(getExternalDeviceIdTypes);
    const environment = useSelector(getEnvironment);

    const dispatch = useDispatch();
    const { t } = useTranslation();
    const { Yup, yupLocaleInitialized } = useValidation();
    const { getDevicesOwnedLink } = useLinks();

    const [selectedDeviceType, setSelectedDeviceType] = useState<string[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string[]>([]);
    const [selectedGridOperator, setSelectedGridOperator] = useState<string[]>([]);
    const [imagesUploaded, setImagesUploaded] = useState(false);
    const [imagesUploadedList, setImagesUploadedList] = useState<string[]>([]);
    const { canCreateDevice } = useDevicePermissions();
    const history = useHistory();

    const useStyles = makeStyles(() =>
        createStyles({
            container: {
                padding: '10px'
            },
            selectContainer: {
                paddingTop: '10px'
            },
            fileUploadInput: {
                display: 'none'
            }
        })
    );

    const classes = useStyles(useTheme());

    const VALIDATION_SCHEMA = Yup.object().shape({
        facilityName: Yup.string().label(t('device.properties.facilityName')).required(),
        capacity: Yup.number().label(t('device.properties.capacity')).required().positive(),
        commissioningDate: Yup.date().required(),
        registrationDate: Yup.date().required(),
        address: Yup.string().label(t('device.properties.address')).required(),
        latitude: Yup.number().label(t('device.properties.latitude')).required().min(-90).max(90),
        longitude: Yup.number()
            .label(t('device.properties.longitude'))
            .required()
            .min(-180)
            .max(180),
        supported: Yup.boolean(),
        projectStory: Yup.string()
    });

    async function submitForm(
        values: typeof INITIAL_FORM_VALUES,
        formikActions: FormikHelpers<typeof INITIAL_FORM_VALUES>
    ): Promise<void> {
        if (!user.blockchainAccountAddress) {
            showNotification(
                t('general.feedback.attachBlockchainAccountFirst'),
                NotificationType.Error
            );
            return;
        }

        if (!user.organization) {
            showNotification(t('general.feedback.noOrganization'), NotificationType.Error);
            return;
        }

        const deviceType = selectedDeviceType.sort((a, b) => b.length - a.length)[0];

        formikActions.setSubmitting(true);
        dispatch(setLoading(true));

        const [region, province] = selectedLocation;

        const externalDeviceIds: IExternalDeviceId[] = externalDeviceIdTypes.map(({ type }) => {
            return {
                id: values[type],
                type
            };
        });

        try {
            const device = await ProducingDevice.createDevice(
                {
                    status: DeviceStatus.Submitted,
                    deviceType,
                    complianceRegistry: compliance,
                    facilityName: values.facilityName,
                    capacityInW: PowerFormatter.getBaseValueFromValueInDisplayUnit(
                        parseFloat(values.capacity)
                    ),
                    country,
                    address: values.address,
                    region: region || '',
                    province: province ? province.split(';')[1] : '',
                    gpsLatitude: values.latitude,
                    gpsLongitude: values.longitude,
                    timezone: 'Asia/Bangkok',
                    operationalSince: values.commissioningDate?.unix(),
                    otherGreenAttributes: '',
                    typeOfPublicSupport: '',
                    description: values.projectStory,
                    images: JSON.stringify(imagesUploadedList),
                    externalDeviceIds,
                    gridOperator: (selectedGridOperator && selectedGridOperator[0]) || ''
                },
                configuration
            );

            dispatch(producingDeviceCreatedOrUpdated(device));

            showNotification(t('device.feedback.deviceCreated'), NotificationType.Success);

            history.push(getDevicesOwnedLink());
        } catch (error) {
            console.error(error);
            showNotification(t('general.feedback.unknownError'), NotificationType.Error);
        }

        dispatch(setLoading(false));
        formikActions.setSubmitting(false);
    }

    async function uploadImages(files: FileList) {
        if (files.length > 10) {
            showNotification(
                t('device.feedback.pleaseSelectUpToXImages', {
                    limit: 10,
                    actual: files.length
                }),
                NotificationType.Error
            );
            return;
        }

        try {
            const uploadedFiles = await offChainDataSource.filesClient.upload(files);

            setImagesUploaded(true);
            setImagesUploadedList(uploadedFiles);
        } catch (error) {
            showNotification(
                t('device.feedback.unexpectedErrorWhenUploadingImages'),
                NotificationType.Error
            );
        }
    }

    if (!configuration || !yupLocaleInitialized) {
        return <Skeleton variant="rect" height={200} />;
    }

    if (!canCreateDevice?.value) {
        return (
            <Paper className={classes.container}>
                <DevicePermissionsFeedback canCreateDevice={canCreateDevice} />
            </Paper>
        );
    }

    const initialFormValues: IFormValues = INITIAL_FORM_VALUES;

    return (
        <Paper className={classes.container}>
            <Formik
                initialValues={initialFormValues}
                onSubmit={submitForm}
                validationSchema={VALIDATION_SCHEMA}
                isInitialValid={false}
            >
                {(formikProps) => {
                    const { isValid, isSubmitting } = formikProps;

                    const fieldDisabled = isSubmitting;
                    const buttonDisabled =
                        isSubmitting ||
                        !isValid ||
                        selectedDeviceType.length === 0 ||
                        !areDeviceSpecificPropertiesValid(
                            selectedLocation,
                            selectedGridOperator,
                            environment
                        );

                    return (
                        <Form translate="">
                            <Grid container spacing={3}>
                                <Grid item xs={6}>
                                    <Typography className="mt-3">
                                        {t('device.info.general')}
                                    </Typography>
                                </Grid>
                            </Grid>

                            <Grid container spacing={3}>
                                <Grid item xs={6}>
                                    <FormControl
                                        fullWidth
                                        variant="filled"
                                        className="mt-3"
                                        required
                                    >
                                        <Field
                                            label={t('device.properties.facilityName')}
                                            name="facilityName"
                                            component={TextField}
                                            variant="filled"
                                            fullWidth
                                            required
                                            disabled={fieldDisabled}
                                        />
                                    </FormControl>
                                    <div className={classes.selectContainer}>
                                        <HierarchicalMultiSelect
                                            selectedValue={selectedDeviceType}
                                            onChange={(value: string[]) =>
                                                setSelectedDeviceType(value)
                                            }
                                            allValues={configuration.deviceTypeService.deviceTypes}
                                            selectOptions={[
                                                {
                                                    label: t('device.properties.deviceType'),
                                                    placeholder: t('device.info.selectDeviceType')
                                                },
                                                {
                                                    label: t('device.properties.deviceType'),
                                                    placeholder: t('device.info.selectDeviceType')
                                                },
                                                {
                                                    label: t('device.properties.deviceType'),
                                                    placeholder: t('device.info.selectDeviceType')
                                                }
                                            ]}
                                            disabled={fieldDisabled}
                                            singleChoice={true}
                                        />
                                    </div>

                                    <Field
                                        name="commissioningDate"
                                        label={t('device.properties.vintageCod')}
                                        className="mt-3"
                                        inputVariant="filled"
                                        variant="inline"
                                        fullWidth
                                        required
                                        component={FormikDatePicker}
                                        disabled={fieldDisabled}
                                    />
                                    <Field
                                        name="registrationDate"
                                        label={t('device.properties.registrationDate')}
                                        className="mt-3"
                                        inputVariant="filled"
                                        variant="inline"
                                        fullWidth
                                        required
                                        component={FormikDatePicker}
                                        disabled={fieldDisabled}
                                    />
                                    <Field
                                        name="supported"
                                        Label={{
                                            label: t('device.info.supported')
                                        }}
                                        color="primary"
                                        component={CheckboxWithLabel}
                                        disabled={fieldDisabled}
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <FormControl
                                        fullWidth
                                        variant="filled"
                                        className="mt-3"
                                        required
                                    >
                                        <Field
                                            label={`${t('device.properties.capacity')} (${
                                                PowerFormatter.displayUnit
                                            })`}
                                            name="capacity"
                                            component={TextField}
                                            variant="filled"
                                            fullWidth
                                            required
                                            disabled={fieldDisabled}
                                        />
                                    </FormControl>
                                    <Grid container>
                                        <DeviceSelectors
                                            location={selectedLocation}
                                            onLocationChange={setSelectedLocation}
                                            gridOperator={selectedGridOperator}
                                            onGridOperatorChange={setSelectedGridOperator}
                                            gridItemSize={12}
                                            singleChoice={true}
                                            disabled={fieldDisabled}
                                        />
                                    </Grid>
                                    <FormControl
                                        fullWidth
                                        variant="filled"
                                        className="mt-3"
                                        required
                                    >
                                        <Field
                                            label={t('device.properties.address')}
                                            name="address"
                                            component={TextField}
                                            variant="filled"
                                            fullWidth
                                            required
                                            disabled={fieldDisabled}
                                        />
                                    </FormControl>
                                    <FormControl
                                        fullWidth
                                        variant="filled"
                                        className="mt-3"
                                        required
                                    >
                                        <Field
                                            label={t('device.properties.latitude')}
                                            name="latitude"
                                            component={TextField}
                                            variant="filled"
                                            fullWidth
                                            required
                                            disabled={fieldDisabled}
                                        />
                                    </FormControl>
                                    <FormControl
                                        fullWidth
                                        variant="filled"
                                        className="mt-3"
                                        required
                                    >
                                        <Field
                                            label={t('device.properties.longitude')}
                                            name="longitude"
                                            component={TextField}
                                            variant="filled"
                                            fullWidth
                                            required
                                            disabled={fieldDisabled}
                                        />
                                    </FormControl>
                                </Grid>
                            </Grid>

                            <Grid container spacing={3}>
                                <Grid item xs={6}>
                                    <Typography className="mt-3">
                                        {t('device.properties.story')}
                                    </Typography>
                                    <FormControl fullWidth variant="filled" className="mt-3">
                                        <Field
                                            label={t('device.properties.projectStory')}
                                            name="projectStory"
                                            component={TextField}
                                            multiline
                                            rows={4}
                                            rowsMax={20}
                                            variant="filled"
                                            fullWidth
                                            disabled={fieldDisabled}
                                        />
                                    </FormControl>

                                    {externalDeviceIdTypes.map((externalDeviceIdType, index) => {
                                        if (externalDeviceIdType.autogenerated) {
                                            return null;
                                        }

                                        return (
                                            <FormInput
                                                key={index}
                                                label={externalDeviceIdType.type}
                                                property={externalDeviceIdType.type}
                                                disabled={fieldDisabled}
                                                className="mt-3"
                                            />
                                        );
                                    })}
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography className="mt-3">
                                        {t('device.properties.images')}
                                    </Typography>
                                    {imagesUploaded ? (
                                        <p className="mt-3">
                                            {t('device.feedback.imagesUploaded')}
                                            <br />
                                            <br />
                                            {t('device.info.pleaseFillOtherFields')}
                                        </p>
                                    ) : (
                                        <>
                                            <input
                                                className={classes.fileUploadInput}
                                                id="contained-button-file"
                                                type="file"
                                                onChange={(e) => uploadImages(e.target.files)}
                                                multiple
                                                disabled={imagesUploaded}
                                            />
                                            <label htmlFor="contained-button-file" className="mt-3">
                                                <Button
                                                    startIcon={<CloudUpload />}
                                                    component="span"
                                                    variant="outlined"
                                                    disabled={imagesUploaded}
                                                >
                                                    {t('device.info.uploadUpToXImages', {
                                                        amount: 10
                                                    })}
                                                </Button>
                                            </label>
                                        </>
                                    )}
                                </Grid>
                            </Grid>

                            <Button
                                type="submit"
                                variant="contained"
                                color="primary"
                                className="mt-3 right"
                                disabled={buttonDisabled}
                            >
                                {t('device.actions.register')}
                            </Button>
                        </Form>
                    );
                }}
            </Formik>
        </Paper>
    );
}
